//! Kuro Manga — Rust core.
//!
//! Everything that touches the filesystem lives here: scanning the linked
//! folder, watching it for changes, reading CBZ indexes, extracting single
//! pages on demand and generating thumbnails. The front-end only asks for
//! what it needs to display.

use std::fs::File;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD, Engine};
use image::imageops::FilterType;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

const IMAGE_EXT: [&str; 7] = ["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp"];

fn is_image(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXT.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_cbz(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("cbz"))
        .unwrap_or(false)
}

fn is_junk(name: &str) -> bool {
    let l = name.to_lowercase();
    l.starts_with('.') || l == "thumbs.db" || l == "desktop.ini" || l == "__macosx"
}

fn basename(p: &Path) -> String {
    p.file_name().unwrap_or_default().to_string_lossy().to_string()
}

fn stem(p: &Path) -> String {
    p.file_stem().unwrap_or_default().to_string_lossy().to_string()
}

#[derive(Serialize, Clone)]
pub struct Volume {
    pub id: String,
    pub series_id: String,
    pub name: String,
    pub kind: String, // "cbz" | "folder" | "loose"
    pub path: String,
    pub page_count: Option<usize>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct Series {
    pub id: String,
    pub name: String, // basename only — never a full path
    pub group_id: Option<String>,
    pub path: String,
    pub volumes: Vec<Volume>,
    pub cover: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct Group {
    pub id: String,
    pub name: String, // '#' stripped
    pub parent_id: Option<String>,
    pub path: String,
}

#[derive(Serialize, Clone, Default)]
pub struct LibraryIndex {
    pub root: String,
    pub root_name: String,
    pub groups: Vec<Group>,
    pub series: Vec<Series>,
}

fn id_for(p: &Path) -> String {
    format!("{:x}", md5_like(p.to_string_lossy().as_bytes()))
}

/// tiny FNV-1a — ids only need to be stable, not cryptographic
fn md5_like(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn natural_sort<T, F: Fn(&T) -> String>(items: &mut [T], key: F) {
    items.sort_by(|a, b| natord::compare(&key(a), &key(b)));
}

fn dir_has_images(p: &Path) -> bool {
    std::fs::read_dir(p)
        .map(|rd| {
            rd.flatten()
                .any(|e| e.path().is_file() && is_image(&e.path()))
        })
        .unwrap_or(false)
}

fn looks_like_cover(name: &str) -> bool {
    let b = name.to_lowercase();
    b.starts_with("cover") || b.starts_with("folder") || b.starts_with("poster")
}

fn build_series(dir: &Path, group_id: Option<String>) -> Series {
    let sid = format!("s_{}", id_for(dir));
    let mut volumes: Vec<Volume> = Vec::new();
    let mut cover: Option<String> = None;
    let mut direct_images: Vec<PathBuf> = Vec::new();
    let mut has_cbz = false;
    let mut image_subdirs: Vec<PathBuf> = Vec::new();

    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            let name = basename(&p);
            if is_junk(&name) {
                continue;
            }
            if p.is_dir() {
                if dir_has_images(&p) {
                    image_subdirs.push(p);
                }
            } else if is_cbz(&p) {
                has_cbz = true;
                volumes.push(Volume {
                    id: format!("v_{}", id_for(&p)),
                    series_id: sid.clone(),
                    name: stem(&p),
                    kind: "cbz".into(),
                    path: p.to_string_lossy().to_string(),
                    page_count: None,
                    error: None,
                });
            } else if is_image(&p) {
                if looks_like_cover(&name) && cover.is_none() {
                    cover = Some(p.to_string_lossy().to_string());
                }
                direct_images.push(p);
            }
        }
    }

    for sub in &image_subdirs {
        let count = std::fs::read_dir(sub)
            .map(|rd| rd.flatten().filter(|e| is_image(&e.path())).count())
            .unwrap_or(0);
        volumes.push(Volume {
            id: format!("v_{}", id_for(sub)),
            series_id: sid.clone(),
            name: basename(sub),
            kind: "folder".into(),
            path: sub.to_string_lossy().to_string(),
            page_count: Some(count),
            error: None,
        });
    }

    // series folder that only holds images == one single volume
    if !has_cbz && image_subdirs.is_empty() && !direct_images.is_empty() {
        volumes.push(Volume {
            id: format!("v_{}__single", id_for(dir)),
            series_id: sid.clone(),
            name: basename(dir),
            kind: "loose".into(),
            path: dir.to_string_lossy().to_string(),
            page_count: Some(direct_images.len()),
            error: None,
        });
    }

    natural_sort(&mut volumes, |v| v.name.clone());

    Series {
        id: sid,
        name: basename(dir),
        group_id,
        path: dir.to_string_lossy().to_string(),
        volumes,
        cover,
    }
}

fn scan_level(dir: &Path, group_id: Option<String>, out: &mut LibraryIndex) {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|rd| rd.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();
    natural_sort(&mut entries, |p| basename(p));

    for p in entries {
        let name = basename(&p);
        if is_junk(&name) {
            continue;
        }
        if p.is_dir() {
            if name.trim_start().starts_with('#') {
                // group folder (sub-library) — never a series, never a volume
                let gid = format!("g_{}", id_for(&p));
                out.groups.push(Group {
                    id: gid.clone(),
                    name: name.trim_start_matches('#').trim().to_string(),
                    parent_id: group_id.clone(),
                    path: p.to_string_lossy().to_string(),
                });
                scan_level(&p, Some(gid), out);
            } else {
                let s = build_series(&p, group_id.clone());
                if !s.volumes.is_empty() {
                    out.series.push(s);
                }
            }
        } else if is_cbz(&p) {
            // loose archive == single-volume series named after the file
            let sid = format!("s_{}", id_for(&p));
            out.series.push(Series {
                id: sid.clone(),
                name: stem(&p),
                group_id: group_id.clone(),
                path: p.to_string_lossy().to_string(),
                volumes: vec![Volume {
                    id: format!("v_{}", id_for(&p)),
                    series_id: sid,
                    name: stem(&p),
                    kind: "cbz".into(),
                    path: p.to_string_lossy().to_string(),
                    page_count: None,
                    error: None,
                }],
                cover: None,
            });
        }
    }
}

#[tauri::command]
fn scan_library(root: String) -> Result<LibraryIndex, String> {
    let path = PathBuf::from(&root);
    if !path.is_dir() {
        return Err("linked folder is not available".into());
    }
    let mut index = LibraryIndex {
        root: root.clone(),
        root_name: basename(&path),
        ..Default::default()
    };
    scan_level(&path, None, &mut index);
    Ok(index)
}

/// Page list of a volume. For CBZ only the ZIP index is read — never the
/// whole archive.
#[tauri::command]
fn list_pages(path: String, kind: String) -> Result<Vec<String>, String> {
    let p = PathBuf::from(&path);
    let mut names: Vec<String> = Vec::new();
    if kind == "cbz" {
        let file = File::open(&p).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..zip.len() {
            let f = zip.by_index_raw(i).map_err(|e| e.to_string())?;
            let name = f.name().to_string();
            if !f.is_dir() && is_image(Path::new(&name)) {
                names.push(name);
            }
        }
    } else {
        for e in std::fs::read_dir(&p).map_err(|e| e.to_string())?.flatten() {
            if is_image(&e.path()) {
                names.push(basename(&e.path()));
            }
        }
    }
    names.sort_by(|a, b| natord::compare(a, b));
    if names.is_empty() {
        return Err("no readable pages".into());
    }
    Ok(names)
}

fn read_page_bytes(path: &str, kind: &str, entry: &str) -> Result<Vec<u8>, String> {
    if kind == "cbz" {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        let mut f = zip.by_name(entry).map_err(|e| e.to_string())?;
        let mut buf = Vec::with_capacity(f.size() as usize);
        f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        Ok(buf)
    } else {
        std::fs::read(Path::new(path).join(entry)).map_err(|e| e.to_string())
    }
}

/// A single page, extracted on demand and optionally downscaled to the
/// requested display width (never decoded at full resolution for thumbnails).
#[tauri::command]
fn read_page(path: String, kind: String, entry: String, max_width: Option<u32>) -> Result<String, String> {
    let bytes = read_page_bytes(&path, &kind, &entry)?;
    let out = match max_width {
        Some(w) if w > 0 => {
            let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
            if img.width() > w {
                let h = (img.height() as f32 * (w as f32 / img.width() as f32)) as u32;
                let small = img.resize(w, h, FilterType::Triangle);
                let mut buf = Cursor::new(Vec::new());
                small
                    .write_to(&mut buf, image::ImageFormat::Jpeg)
                    .map_err(|e| e.to_string())?;
                buf.into_inner()
            } else {
                bytes
            }
        }
        _ => bytes,
    };
    Ok(STANDARD.encode(out))
}

#[derive(Serialize, Deserialize)]
pub struct WatchState {
    pub root: Option<String>,
}

#[tauri::command]
fn start_watcher(app: tauri::AppHandle, root: String) -> Result<(), String> {
    use notify::{RecursiveMode, Watcher};
    let handle = app.clone();
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(_) => return,
        };
        if watcher
            .watch(Path::new(&root), RecursiveMode::Recursive)
            .is_err()
        {
            return;
        }
        while let Ok(Ok(_event)) = rx.recv() {
            let _ = handle.emit("library-changed", ());
        }
    });
    Ok(())
}

pub struct AppState(pub Mutex<WatchState>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(AppState(Mutex::new(WatchState { root: None })))
        .invoke_handler(tauri::generate_handler![
            scan_library,
            list_pages,
            read_page,
            start_watcher
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kuro Manga");
}

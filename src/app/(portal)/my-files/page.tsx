"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useFileManager } from "@/hooks/use-file-manager";
import {
  type FileFolder,
  type FileRecord,
  getFoldersInParent,
  getFilesInFolder,
  getFolderPath,
  getFolderById,
  PATIENT_FOLDERS_ROOT_ID,
} from "@/lib/file-manager";
import {
  formatFileSize,
  getSignedUrl,
  downloadFile,
} from "@/lib/file-storage";
import { patients as patientRecords } from "@/lib/mock-data";

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------

type FolderViewMode = "grid" | "list";
const VIEW_MODE_KEY = "casemate.files-view-mode";

function loadViewMode(): FolderViewMode {
  if (typeof window === "undefined") return "list";
  const stored = window.localStorage.getItem(VIEW_MODE_KEY);
  return stored === "grid" ? "grid" : "list";
}

function saveViewMode(mode: FolderViewMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIEW_MODE_KEY, mode);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return "\uD83D\uDDBC\uFE0F";
  if (mimeType === "application/pdf") return "\uD83D\uDCC4";
  if (mimeType.includes("word") || mimeType.includes("document")) return "\uD83D\uDDD2\uFE0F";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "\uD83D\uDCCA";
  return "\uD83D\uDCC1";
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

function isPdfMime(mime: string) {
  return mime === "application/pdf";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MyFilesPage() {
  const patients = patientRecords;
  const {
    state,
    createFolder,
    updateFolderName,
    deleteUserFolder,
    uploadFile,
    deleteFile,
  } = useFileManager(patients);

  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [message, setMessage] = useState("");
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<FolderViewMode>(() => loadViewMode());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleViewMode = (mode: FolderViewMode) => {
    setViewMode(mode);
    saveViewMode(mode);
  };

  // Derived data
  const subfolders = useMemo(
    () => getFoldersInParent(state, currentFolderId),
    [state, currentFolderId],
  );
  const filesInFolder = useMemo(
    () => (currentFolderId ? getFilesInFolder(state, currentFolderId) : []),
    [state, currentFolderId],
  );
  const breadcrumb = useMemo(
    () => (currentFolderId ? getFolderPath(state, currentFolderId) : []),
    [state, currentFolderId],
  );
  const currentFolder = currentFolderId ? getFolderById(state, currentFolderId) : null;
  const canUploadHere = currentFolderId !== null; // can only upload inside a folder, not at root
  const isSystemFolder = currentFolder?.isSystemFolder ?? false;

  // ---------------------------------------------------------------------------
  // Folder actions
  // ---------------------------------------------------------------------------

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    createFolder(name, currentFolderId);
    setNewFolderName("");
    setShowNewFolderInput(false);
    setMessage(`Folder "${name}" created.`);
  };

  const handleRenameFolder = (folderId: string) => {
    const name = renameValue.trim();
    if (!name) return;
    updateFolderName(folderId, name);
    setRenamingFolderId(null);
    setRenameValue("");
    setMessage("Folder renamed.");
  };

  const handleDeleteFolder = async (folderId: string) => {
    setDeletingFolderId(folderId);
    await deleteUserFolder(folderId);
    setDeletingFolderId(null);
    setMessage("Folder deleted.");
  };

  // ---------------------------------------------------------------------------
  // File actions
  // ---------------------------------------------------------------------------

  const handleFileSelect = async (files: FileList | File[]) => {
    if (!currentFolderId || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    let successCount = 0;
    let lastError = "";

    for (const file of Array.from(files)) {
      const result = await uploadFile(currentFolderId, file);
      if (result.success) {
        successCount++;
      } else {
        lastError = result.error ?? "Upload failed";
      }
    }

    setUploading(false);
    if (successCount > 0) {
      setMessage(`${successCount} file${successCount > 1 ? "s" : ""} uploaded.`);
    }
    if (lastError) {
      setUploadError(lastError);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileSelect(e.target.files);
      e.target.value = "";
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    setDeletingFileId(fileId);
    await deleteFile(fileId);
    setDeletingFileId(null);
    setMessage("File deleted.");
  };

  const handleDownload = (file: FileRecord) => {
    downloadFile(file.storagePath, file.name);
  };

  // ---------------------------------------------------------------------------
  // Email file (download + open mailto) — desktop approach
  // ---------------------------------------------------------------------------

  const [emailingFileId, setEmailingFileId] = useState<string | null>(null);

  const handleEmailFile = async (file: FileRecord) => {
    setEmailingFileId(file.id);
    try {
      // Start the download so the file is ready to attach
      downloadFile(file.storagePath, file.name);

      // Open mailto with pre-filled subject & body hint
      const subject = encodeURIComponent(file.name);
      const body = encodeURIComponent(
        `Please find the attached file: ${file.name}\n\n(The file has been downloaded to your device — please attach it to this email.)`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
    } finally {
      // Brief delay so the button shows loading state
      setTimeout(() => setEmailingFileId(null), 1000);
    }
  };

  // ---------------------------------------------------------------------------
  // Share file (Web Share API) — mobile/tablet native share sheet
  // ---------------------------------------------------------------------------

  const [sharingFileId, setSharingFileId] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    // Detect Web Share API with file support
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function");
  }, []);

  const handleShareFile = async (file: FileRecord) => {
    setSharingFileId(file.id);
    try {
      const { url, error } = await getSignedUrl(file.storagePath);
      if (error || !url) {
        setMessage("Could not prepare file for sharing.");
        return;
      }

      // Fetch the file as a blob so we can share it natively
      const response = await fetch(url);
      const blob = await response.blob();
      const shareFile = new File([blob], file.name, { type: file.mimeType });

      const shareData: ShareData = {
        title: file.name,
        files: [shareFile],
      };

      if (navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback: just share the URL
        await navigator.share({
          title: file.name,
          text: `File: ${file.name}`,
          url,
        });
      }
    } catch (err: unknown) {
      // User cancelled the share sheet — not an error
      if (err instanceof Error && err.name === "AbortError") return;
      setMessage("Share failed. Try downloading instead.");
    } finally {
      setSharingFileId(null);
    }
  };

  const handlePreview = async (file: FileRecord) => {
    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewUrl("");
    const { url, error } = await getSignedUrl(file.storagePath);
    if (error || !url) {
      setPreviewUrl("");
      setPreviewLoading(false);
      return;
    }
    setPreviewUrl(url);
    setPreviewLoading(false);
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewUrl("");
  };

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0 && canUploadHere) {
        handleFileSelect(e.dataTransfer.files);
      }
    },
    [canUploadHere, currentFolderId],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-heading)]">My Files</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Upload and organize documents, imaging reports, attorney letters, and more.
      </p>

      {/* Breadcrumb */}
      <div className="mt-4 flex items-center gap-1 text-sm">
        <button
          className={`font-medium ${currentFolderId ? "text-blue-600 hover:underline" : "text-[var(--text-heading)]"}`}
          onClick={() => setCurrentFolderId(null)}
          type="button"
        >
          My Files
        </button>
        {breadcrumb.map((folder) => (
          <span key={folder.id} className="flex items-center gap-1">
            <span className="text-[var(--text-muted)]">/</span>
            <button
              className={`font-medium ${folder.id === currentFolderId ? "text-[var(--text-heading)]" : "text-blue-600 hover:underline"}`}
              onClick={() => setCurrentFolderId(folder.id)}
              type="button"
            >
              {folder.name}
            </button>
          </span>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {currentFolderId && (
          <button
            className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--bg-soft)]"
            onClick={() => {
              const parent = currentFolder?.parentId ?? null;
              setCurrentFolderId(parent);
            }}
            type="button"
          >
            &larr; Back
          </button>
        )}

        {!isSystemFolder && (
          <button
            className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--bg-soft)]"
            onClick={() => {
              setShowNewFolderInput(true);
              setNewFolderName("");
            }}
            type="button"
          >
            + New Folder
          </button>
        )}

        {canUploadHere && (
          <>
            <button
              className="rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {uploading ? "Uploading..." : "Upload File"}
            </button>
            <input
              ref={fileInputRef}
              accept="*/*"
              className="hidden"
              multiple
              onChange={handleFileInputChange}
              type="file"
            />
          </>
        )}

        {/* View mode toggle */}
        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-[var(--line-soft)] bg-white p-0.5">
          <button
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-blue-600 text-white" : "text-[var(--text-muted)] hover:text-[var(--text-heading)]"}`}
            onClick={() => toggleViewMode("list")}
            title="List view"
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>
          </button>
          <button
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${viewMode === "grid" ? "bg-blue-600 text-white" : "text-[var(--text-muted)] hover:text-[var(--text-heading)]"}`}
            onClick={() => toggleViewMode("grid")}
            title="Grid view"
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect height="7" rx="1" width="7" x="3" y="3" /><rect height="7" rx="1" width="7" x="14" y="3" /><rect height="7" rx="1" width="7" x="3" y="14" /><rect height="7" rx="1" width="7" x="14" y="14" /></svg>
          </button>
        </div>

        {message && (
          <span className="text-sm text-green-700">{message}</span>
        )}
        {uploadError && (
          <span className="text-sm text-red-600">{uploadError}</span>
        )}
      </div>

      {/* New folder input */}
      {showNewFolderInput && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateFolder();
          }}
        >
          <input
            autoFocus
            className="w-64 rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm"
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            value={newFolderName}
          />
          <button
            className="rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            type="submit"
          >
            Create
          </button>
          <button
            className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--bg-soft)]"
            onClick={() => setShowNewFolderInput(false)}
            type="button"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Drop zone wrapper */}
      <div
        className={`mt-4 min-h-[300px] rounded-2xl border-2 transition-colors ${
          dragOver && canUploadHere
            ? "border-blue-400 bg-blue-50"
            : "border-transparent"
        }`}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Folders — Grid view */}
        {subfolders.length > 0 && viewMode === "grid" && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Folders
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {subfolders.map((folder) => (
                <div key={folder.id} className="group relative">
                  {renamingFolderId === folder.id ? (
                    <form
                      className="flex flex-col gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleRenameFolder(folder.id);
                      }}
                    >
                      <input
                        autoFocus
                        className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
                        onChange={(e) => setRenameValue(e.target.value)}
                        value={renameValue}
                      />
                      <div className="flex gap-1">
                        <button className="text-xs text-blue-600 hover:underline" type="submit">
                          Save
                        </button>
                        <button
                          className="text-xs text-[var(--text-muted)] hover:underline"
                          onClick={() => setRenamingFolderId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="flex w-full flex-col items-center gap-1 rounded-xl border border-[var(--line-soft)] bg-white p-3 text-center hover:bg-[var(--bg-soft)] hover:shadow-sm transition-all"
                      onClick={() => setCurrentFolderId(folder.id)}
                      type="button"
                    >
                      <span className="text-3xl">
                        {folder.isSystemFolder ? "\uD83D\uDCC2" : "\uD83D\uDCC1"}
                      </span>
                      <span className="text-xs font-medium leading-tight text-[var(--text-heading)] line-clamp-2">
                        {folder.name}
                      </span>
                    </button>
                  )}

                  {/* Context actions for non-system folders */}
                  {!folder.isSystemFolder && renamingFolderId !== folder.id && (
                    <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                      <button
                        className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 shadow-sm hover:bg-blue-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingFolderId(folder.id);
                          setRenameValue(folder.name);
                        }}
                        title="Rename"
                        type="button"
                      >
                        Rename
                      </button>
                      <button
                        className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-red-600 shadow-sm hover:bg-red-50"
                        disabled={deletingFolderId === folder.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete folder "${folder.name}" and all files inside?`)) {
                            handleDeleteFolder(folder.id);
                          }
                        }}
                        title="Delete"
                        type="button"
                      >
                        {deletingFolderId === folder.id ? "..." : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Folders — List view */}
        {subfolders.length > 0 && viewMode === "list" && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Folders
            </p>
            <div className="overflow-hidden rounded-xl border border-[var(--line-soft)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line-soft)] bg-[var(--bg-soft)]">
                    <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">Name</th>
                    <th className="hidden px-3 py-2 text-left font-semibold text-[var(--text-muted)] sm:table-cell">Items</th>
                    <th className="hidden px-3 py-2 text-left font-semibold text-[var(--text-muted)] md:table-cell">Created</th>
                    <th className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subfolders.map((folder) => {
                    const childFolderCount = state.folders.filter((f) => f.parentId === folder.id).length;
                    const childFileCount = state.files.filter((f) => f.folderId === folder.id).length;
                    const itemCount = childFolderCount + childFileCount;

                    return (
                      <tr
                        key={folder.id}
                        className="group border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--bg-soft)] cursor-pointer"
                        onClick={() => {
                          if (renamingFolderId !== folder.id) setCurrentFolderId(folder.id);
                        }}
                      >
                        <td className="px-3 py-2">
                          {renamingFolderId === folder.id ? (
                            <form
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleRenameFolder(folder.id);
                              }}
                            >
                              <input
                                autoFocus
                                className="w-48 rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
                                onChange={(e) => setRenameValue(e.target.value)}
                                value={renameValue}
                              />
                              <button className="text-xs text-blue-600 hover:underline" type="submit">Save</button>
                              <button
                                className="text-xs text-[var(--text-muted)] hover:underline"
                                onClick={() => setRenamingFolderId(null)}
                                type="button"
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {folder.isSystemFolder ? "\uD83D\uDCC2" : "\uD83D\uDCC1"}
                              </span>
                              <span className="font-medium text-[var(--text-heading)]">
                                {folder.name}
                              </span>
                              {folder.isSystemFolder && (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">System</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="hidden px-3 py-2 text-[var(--text-muted)] sm:table-cell">
                          {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? "s" : ""}` : "Empty"}
                        </td>
                        <td className="hidden px-3 py-2 text-[var(--text-muted)] md:table-cell">
                          {formatDate(folder.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {!folder.isSystemFolder && renamingFolderId !== folder.id && (
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                                onClick={() => {
                                  setRenamingFolderId(folder.id);
                                  setRenameValue(folder.name);
                                }}
                                type="button"
                              >
                                Rename
                              </button>
                              <button
                                className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                disabled={deletingFolderId === folder.id}
                                onClick={() => {
                                  if (confirm(`Delete folder "${folder.name}" and all files inside?`)) {
                                    handleDeleteFolder(folder.id);
                                  }
                                }}
                                type="button"
                              >
                                {deletingFolderId === folder.id ? "..." : "Delete"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Files list */}
        {currentFolderId && filesInFolder.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Files
            </p>
            <div className="overflow-hidden rounded-xl border border-[var(--line-soft)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line-soft)] bg-[var(--bg-soft)]">
                    <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">Name</th>
                    <th className="hidden px-3 py-2 text-left font-semibold text-[var(--text-muted)] sm:table-cell">Size</th>
                    <th className="hidden px-3 py-2 text-left font-semibold text-[var(--text-muted)] md:table-cell">Uploaded</th>
                    <th className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filesInFolder.map((file) => (
                    <tr
                      key={file.id}
                      className="border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--bg-soft)]"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span>{getFileIcon(file.mimeType)}</span>
                          <span className="font-medium text-[var(--text-heading)] truncate max-w-[200px] sm:max-w-[300px]">
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 text-[var(--text-muted)] sm:table-cell">
                        {formatFileSize(file.sizeBytes)}
                      </td>
                      <td className="hidden px-3 py-2 text-[var(--text-muted)] md:table-cell">
                        {formatDate(file.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(isImageMime(file.mimeType) || isPdfMime(file.mimeType)) && (
                            <button
                              className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                              onClick={() => handlePreview(file)}
                              type="button"
                            >
                              Preview
                            </button>
                          )}
                          <button
                            className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                            onClick={() => handleDownload(file)}
                            type="button"
                          >
                            Download
                          </button>
                          {/* Email button — downloads file + opens mailto */}
                          <button
                            className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                            disabled={emailingFileId === file.id}
                            onClick={() => handleEmailFile(file)}
                            title="Download file and open email to attach"
                            type="button"
                          >
                            {emailingFileId === file.id ? "..." : "Email"}
                          </button>
                          {/* Share button — native share sheet (mobile/tablet) */}
                          {canShare && (
                            <button
                              className="rounded-lg px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50"
                              disabled={sharingFileId === file.id}
                              onClick={() => handleShareFile(file)}
                              title="Share file via native share sheet"
                              type="button"
                            >
                              {sharingFileId === file.id ? "..." : "Share"}
                            </button>
                          )}
                          <button
                            className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            disabled={deletingFileId === file.id}
                            onClick={() => {
                              if (confirm(`Delete "${file.name}"?`)) {
                                handleDeleteFile(file.id);
                              }
                            }}
                            type="button"
                          >
                            {deletingFileId === file.id ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {currentFolderId && filesInFolder.length === 0 && subfolders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-4xl">
              {canUploadHere ? "\uD83D\uDCC2" : "\uD83D\uDCC1"}
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">
              {canUploadHere
                ? "This folder is empty. Upload files or drag and drop them here."
                : "This folder is empty."}
            </p>
          </div>
        )}

        {!currentFolderId && subfolders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-4xl">{"\uD83D\uDCC1"}</p>
            <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">
              No folders yet. Create a folder to get started.
            </p>
          </div>
        )}

        {/* Drag and drop hint when dragging */}
        {dragOver && canUploadHere && (
          <div className="pointer-events-none flex items-center justify-center py-8">
            <p className="text-sm font-medium text-blue-600">
              Drop files here to upload
            </p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span>{getFileIcon(previewFile.mimeType)}</span>
                <span className="font-medium text-[var(--text-heading)] truncate">
                  {previewFile.name}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatFileSize(previewFile.sizeBytes)}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                  onClick={() => handleDownload(previewFile)}
                  type="button"
                >
                  Download
                </button>
                <button
                  className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                  disabled={emailingFileId === previewFile.id}
                  onClick={() => handleEmailFile(previewFile)}
                  title="Download file and open email to attach"
                  type="button"
                >
                  {emailingFileId === previewFile.id ? "..." : "Email"}
                </button>
                {canShare && (
                  <button
                    className="rounded-lg px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50"
                    disabled={sharingFileId === previewFile.id}
                    onClick={() => handleShareFile(previewFile)}
                    title="Share file via native share sheet"
                    type="button"
                  >
                    {sharingFileId === previewFile.id ? "..." : "Share"}
                  </button>
                )}
                <button
                  className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
                  onClick={closePreview}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {previewLoading && (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm text-[var(--text-muted)]">Loading preview...</p>
                </div>
              )}
              {!previewLoading && !previewUrl && (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm text-red-600">Could not load preview.</p>
                </div>
              )}
              {!previewLoading && previewUrl && isImageMime(previewFile.mimeType) && (
                <div className="flex items-center justify-center">
                  <img
                    alt={previewFile.name}
                    className="max-h-[70vh] max-w-full rounded-lg object-contain"
                    src={previewUrl}
                  />
                </div>
              )}
              {!previewLoading && previewUrl && isPdfMime(previewFile.mimeType) && (
                <iframe
                  className="h-[70vh] w-full rounded-lg border border-[var(--line-soft)]"
                  src={previewUrl}
                  title={previewFile.name}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

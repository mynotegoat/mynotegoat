"use client";

import { useCallback, useEffect, useState } from "react";
import type { PatientRecord } from "@/lib/mock-data";
import type { CaseStatusConfig } from "@/lib/case-statuses";
import {
  type FileManagerState,
  type FileRecord,
  addFolder,
  renameFolder,
  deleteFolder as deleteFolderOp,
  addFileRecord,
  removeFileRecord,
  renameFileRecord,
  loadFileManagerState,
  saveFileManagerState,
  syncPatientFolders,
} from "@/lib/file-manager";
import {
  uploadFileToStorage,
  deleteFileFromStorage,
  deleteFilesFromStorage,
} from "@/lib/file-storage";

export function useFileManager(patients: PatientRecord[], caseStatuses: CaseStatusConfig[] = []) {
  const [state, setState] = useState<FileManagerState>(() => {
    const loaded = loadFileManagerState();
    return syncPatientFolders(loaded, patients, caseStatuses);
  });

  // Re-sync patient folders when patients change
  useEffect(() => {
    setState((current) => {
      const synced = syncPatientFolders(current, patients, caseStatuses);
      // Only update if folders actually changed
      if (synced.folders.length !== current.folders.length) {
        saveFileManagerState(synced);
        return synced;
      }
      // Check if any folder was renamed/moved
      const changed = synced.folders.some((sf, i) => {
        const cf = current.folders[i];
        return !cf || cf.name !== sf.name || cf.parentId !== sf.parentId;
      });
      if (changed) {
        saveFileManagerState(synced);
        return synced;
      }
      return current;
    });
  }, [patients, caseStatuses]);

  const persist = useCallback((next: FileManagerState) => {
    saveFileManagerState(next);
    setState(next);
  }, []);

  // --- Folder operations ---

  const createFolder = useCallback(
    (name: string, parentId: string | null) => {
      if (!name.trim()) return;
      setState((current) => {
        const next = addFolder(current, name, parentId);
        saveFileManagerState(next);
        return next;
      });
    },
    [],
  );

  const updateFolderName = useCallback(
    (folderId: string, newName: string) => {
      if (!newName.trim()) return;
      setState((current) => {
        const next = renameFolder(current, folderId, newName);
        saveFileManagerState(next);
        return next;
      });
    },
    [],
  );

  const deleteUserFolder = useCallback(
    async (folderId: string) => {
      let pathsToDelete: string[] = [];
      setState((current) => {
        const result = deleteFolderOp(current, folderId);
        pathsToDelete = result.deletedStoragePaths;
        saveFileManagerState(result.state);
        return result.state;
      });
      // Delete actual files from storage in background
      if (pathsToDelete.length > 0) {
        await deleteFilesFromStorage(pathsToDelete);
      }
    },
    [],
  );

  // --- File operations ---

  const uploadFile = useCallback(
    async (
      folderId: string,
      file: File,
    ): Promise<{ success: boolean; error?: string }> => {
      const { storagePath, error } = await uploadFileToStorage(folderId, file);
      if (error || !storagePath) {
        return { success: false, error: error ?? "Upload failed" };
      }

      setState((current) => {
        const next = addFileRecord(current, {
          folderId,
          name: file.name,
          storagePath,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });
        saveFileManagerState(next);
        return next;
      });

      return { success: true };
    },
    [],
  );

  const renameFile = useCallback(
    (fileId: string, newName: string) => {
      setState((current) => {
        const next = renameFileRecord(current, fileId, newName);
        saveFileManagerState(next);
        return next;
      });
    },
    [],
  );

  const deleteFile = useCallback(
    async (fileId: string) => {
      let pathToDelete: string | null = null;
      setState((current) => {
        const result = removeFileRecord(current, fileId);
        pathToDelete = result.storagePath;
        saveFileManagerState(result.state);
        return result.state;
      });
      if (pathToDelete) {
        await deleteFileFromStorage(pathToDelete);
      }
    },
    [],
  );

  return {
    state,
    createFolder,
    updateFolderName,
    deleteUserFolder,
    uploadFile,
    renameFile,
    deleteFile,
  };
}


import { SavedProject } from "../types";

const DB_NAME = "ThesignArchitectDB";
const STORE_NAME = "projects";
const DB_VERSION = 1;

export class StorageService {
  private static openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async saveProject(project: SavedProject): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(project);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async getAllProjects(): Promise<SavedProject[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        // Susun mengikut tarikh terbaru
        const projects = (request.result as SavedProject[]).sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        resolve(projects);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async deleteProject(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async getActiveProject(): Promise<SavedProject | null> {
    const data = localStorage.getItem('thesign_active_id');
    if (!data) return null;
    const projects = await this.getAllProjects();
    return projects.find(p => p.id === data) || null;
  }

  static setActiveProjectId(id: string) {
    localStorage.setItem('thesign_active_id', id);
  }
}

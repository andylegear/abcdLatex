// src/services/DraftStore.ts

const DB_NAME = 'abcdlatex-drafts';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;

export interface DraftEntry {
	key: string; // owner/repo/branch/filepath
	content: string;
	savedAt: number;
}

class DraftStore {
	private db: IDBDatabase | null = null;

	private async getDb(): Promise<IDBDatabase> {
		if (this.db) return this.db;

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, { keyPath: 'key' });
				}
			};
			request.onsuccess = () => {
				this.db = request.result;
				resolve(this.db);
			};
			request.onerror = () => reject(request.error);
		});
	}

	private makeKey(owner: string, repo: string, branch: string, filePath: string): string {
		return `${owner}/${repo}/${branch}/${filePath}`;
	}

	async saveDraft(
		owner: string,
		repo: string,
		branch: string,
		filePath: string,
		content: string,
	): Promise<void> {
		const db = await this.getDb();
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const entry: DraftEntry = {
			key: this.makeKey(owner, repo, branch, filePath),
			content,
			savedAt: Date.now(),
		};
		store.put(entry);
		return new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async getDraft(
		owner: string,
		repo: string,
		branch: string,
		filePath: string,
	): Promise<DraftEntry | null> {
		const db = await this.getDb();
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const key = this.makeKey(owner, repo, branch, filePath);
		const request = store.get(key);
		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result ?? null);
			request.onerror = () => reject(request.error);
		});
	}

	async clearDraft(
		owner: string,
		repo: string,
		branch: string,
		filePath: string,
	): Promise<void> {
		const db = await this.getDb();
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const key = this.makeKey(owner, repo, branch, filePath);
		store.delete(key);
		return new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}

export const draftStore = new DraftStore();

// src/services/TokenStore.ts

export interface RecentProject {
	owner: string;
	repo: string;
	branch: string;
	lastFile: string | null;
	lastOpened: number;
}

const TOKEN_KEY = 'abcdlatex_token';
const PROJECTS_KEY = 'abcdlatex_projects';
const TOUR_KEY = 'abcdlatex_tour_seen';
const AUTOSAVE_MINUTES_KEY = 'abcdlatex_autosave_minutes';

class TokenStore {
	getToken(): string | null {
		return localStorage.getItem(TOKEN_KEY);
	}

	setToken(token: string): void {
		localStorage.setItem(TOKEN_KEY, token);
	}

	clearToken(): void {
		localStorage.removeItem(TOKEN_KEY);
	}

	getRecentProjects(): RecentProject[] {
		try {
			const raw = localStorage.getItem(PROJECTS_KEY);
			if (!raw) return [];
			return JSON.parse(raw) as RecentProject[];
		} catch {
			return [];
		}
	}

	addRecentProject(project: Omit<RecentProject, 'lastOpened'>): void {
		const projects = this.getRecentProjects();
		const key = `${project.owner}/${project.repo}@${project.branch}`;
		const filtered = projects.filter(
			(p) => `${p.owner}/${p.repo}@${p.branch}` !== key,
		);
		filtered.unshift({
			...project,
			lastOpened: Date.now(),
		});
		// Keep at most 20 recent projects
		localStorage.setItem(PROJECTS_KEY, JSON.stringify(filtered.slice(0, 20)));
	}

	updateLastFile(owner: string, repo: string, branch: string, filePath: string): void {
		const projects = this.getRecentProjects();
		const idx = projects.findIndex(
			(p) => p.owner === owner && p.repo === repo && p.branch === branch,
		);
		if (idx >= 0) {
			projects[idx].lastFile = filePath;
			projects[idx].lastOpened = Date.now();
			localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
		}
	}

	removeRecentProject(owner: string, repo: string, branch: string): void {
		const projects = this.getRecentProjects().filter(
			(p) => !(p.owner === owner && p.repo === repo && p.branch === branch),
		);
		localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
	}

	isTourSeen(): boolean {
		return localStorage.getItem(TOUR_KEY) === 'true';
	}

	setTourSeen(): void {
		localStorage.setItem(TOUR_KEY, 'true');
	}

	resetTourSeen(): void {
		localStorage.removeItem(TOUR_KEY);
	}

	getAutoCommitMinutes(): number {
		const val = localStorage.getItem(AUTOSAVE_MINUTES_KEY);
		return val ? Number.parseInt(val, 10) : 5;
	}

	setAutoCommitMinutes(minutes: number): void {
		localStorage.setItem(AUTOSAVE_MINUTES_KEY, String(minutes));
	}
}

export const tokenStore = new TokenStore();

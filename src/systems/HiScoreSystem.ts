export interface HiScoreEntry {
  name: string;
  score: number;
  level: number;
  date: string;
}

const STORAGE_KEY = 'wizball_hiscores';
const MAX_SCORES = 10;

export default class HiScoreSystem {
  private scores: HiScoreEntry[] = [];

  constructor() {
    this.load();
  }

  load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.scores = JSON.parse(stored);
      }
    } catch {
      this.scores = this.getDefaultScores();
    }

    if (this.scores.length === 0) {
      this.scores = this.getDefaultScores();
    }
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.scores));
    } catch (e) {
      console.warn('Failed to save high scores:', e);
    }
  }

  private getDefaultScores(): HiScoreEntry[] {
    return [
      { name: 'WIZ', score: 50000, level: 8, date: '2024-01-01' },
      { name: 'CAT', score: 40000, level: 7, date: '2024-01-01' },
      { name: 'PIX', score: 30000, level: 6, date: '2024-01-01' },
      { name: 'ZEB', score: 25000, level: 5, date: '2024-01-01' },
      { name: 'MAX', score: 20000, level: 5, date: '2024-01-01' },
      { name: 'JOY', score: 15000, level: 4, date: '2024-01-01' },
      { name: 'ACE', score: 10000, level: 3, date: '2024-01-01' },
      { name: 'BEN', score: 7500, level: 3, date: '2024-01-01' },
      { name: 'DOC', score: 5000, level: 2, date: '2024-01-01' },
      { name: 'NEW', score: 2500, level: 1, date: '2024-01-01' },
    ];
  }

  addScore(name: string, score: number, level: number): number {
    const entry: HiScoreEntry = {
      name: name.toUpperCase().substring(0, 13), // C++ HISCORE_MAX_NAME_LENGTH = 13
      score,
      level,
      date: new Date().toISOString().split('T')[0]
    };

    this.scores.push(entry);
    this.scores.sort((a, b) => b.score - a.score);
    this.scores = this.scores.slice(0, MAX_SCORES);
    this.save();

    return this.scores.findIndex(s => s === entry);
  }

  isHighScore(score: number): boolean {
    if (this.scores.length < MAX_SCORES) return true;
    return score > this.scores[this.scores.length - 1].score;
  }

  getScores(): HiScoreEntry[] {
    return [...this.scores];
  }

  getTopScore(): number {
    return this.scores.length > 0 ? this.scores[0].score : 0;
  }

  getRank(score: number): number {
    for (let i = 0; i < this.scores.length; i++) {
      if (score >= this.scores[i].score) {
        return i + 1;
      }
    }
    return this.scores.length + 1;
  }

  clear(): void {
    this.scores = this.getDefaultScores();
    this.save();
  }
}

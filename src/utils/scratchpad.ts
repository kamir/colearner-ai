export class Scratchpad {
  private entries: string[] = [];

  add(entry: string): void {
    this.entries.push(entry);
  }

  summaries(): string[] {
    return [...this.entries];
  }
}

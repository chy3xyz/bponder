type IndexingFunction = (...args: any[]) => any;

type Registration = {
  name: string;
  fn: IndexingFunction;
};

export const ponder = {
  fns: [] as Registration[],
  on(name: string, fn: IndexingFunction) {
    this.fns.push({ name, fn });
  },
};

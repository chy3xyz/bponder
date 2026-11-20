type IndexingFunction = (...args: any[]) => any;

export type Registration = {
  name: string;
  fn: IndexingFunction;
};

const fns: Registration[] = [];

export const ponder = {
  fns,
  on: (name: string, fn: IndexingFunction) => {
    fns.push({ name, fn });
  },
};

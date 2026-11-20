type IndexingFunction = (...args: any[]) => any;

type Registration = {
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

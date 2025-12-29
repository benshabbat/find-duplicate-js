// Array utilities - intentional duplicates

const mapItems = (items, fn = (item) => item) => {
  return items.map(item => fn(item));
};

const filterItems = (items, predicate = (item) => true) => {
  return items.filter(item => predicate(item));
};

const sumItems = (items, accumulator = (a, b) => a + b) => {
  return items.reduce(accumulator, 0);
};

const chunk = (array, size = 1) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export { mapItems, filterItems, sumItems, chunk };

// Helper functions with various parameter patterns

const mapArray = (items, fn = (item) => item) => {
  return items.map(item => fn(item));
};

const filterArray = (items, predicate = (item) => true) => {
  return items.filter(item => predicate(item));
};

const reduceArray = (items, accumulator = (a, b) => a + b) => {
  return items.reduce(accumulator, 0);
};

const debounce = (func, wait = 300, options = {leading: false}) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!options.leading) func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export { mapArray, filterArray, reduceArray, debounce };

// Data processing with destructuring and default parameters

const processData = ({data, metadata: {id, timestamp}}, [filter, mapper]) => {
  return data
    .filter(filter)
    .map(mapper)
    .map(item => ({...item, id, timestamp}));
};

const transformItems = (items, transformer = (item) => item) => {
  return items.map(item => transformer(item));
};

const aggregateResults = ({values}, reducer = (a, b) => a + b) => {
  return values.reduce(reducer, 0);
};

async function fetchAndProcess({url, options = {}}, callbacks = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  return callbacks.transform ? callbacks.transform(data) : data;
}

export { processData, transformItems, aggregateResults, fetchAndProcess };

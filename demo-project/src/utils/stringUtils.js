// String manipulation with default parameters

const trimString = (str, char = " ") => {
  return str.trim();
};

const padString = (str, length = 10, padChar = " ") => {
  return str.padEnd(length, padChar);
};

const replaceAll = (str, search = "", replace = "") => {
  return str.split(search).join(replace);
};

// Similar function with different name
const removeSpaces = (text, character = " ") => {
  return text.trim();
};

export { trimString, padString, replaceAll, removeSpaces };

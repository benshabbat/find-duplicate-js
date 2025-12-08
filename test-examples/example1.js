// קובץ דוגמה 1 - פונקציות שונות

function calculateSum(a, b) {
  const result = a + b;
  return result;
}

function addNumbers(x, y) {
  const total = x + y;
  return total;
}

const getUserData = async (userId) => {
  const response = await fetch(`/api/users/${userId}`);
  const data = await response.json();
  return data;
}

function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

const processArray = (arr) => {
  return arr.map(item => item * 2).filter(item => item > 10);
}

// קובץ דוגמה 2 - פונקציות דומות לקובץ 1

function sumTwoNumbers(num1, num2) {
  const sum = num1 + num2;
  return sum;
}

async function fetchUserInfo(id) {
  const response = await fetch(`/api/users/${id}`);
  const userData = await response.json();
  return userData;
}

function checkEmailFormat(emailAddress) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(emailAddress);
}

const transformArray = (array) => {
  return array.map(element => element * 2).filter(element => element > 10);
}

function calculateDiscount(price, percentage) {
  const discount = price * (percentage / 100);
  return price - discount;
}

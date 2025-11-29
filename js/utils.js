export function $(selector) {
  return document.querySelector(selector);
}

export function showError(msg) {
  alert("Erreur : " + msg);
}

export function showSuccess(msg) {
  alert(msg);
}


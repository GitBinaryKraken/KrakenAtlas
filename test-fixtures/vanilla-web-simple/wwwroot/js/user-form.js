function saveUserForm() {
  const nameInput = document.querySelector("#user-name");
  return fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ name: nameInput.value })
  });
}

document.getElementById("save-user").addEventListener("click", saveUserForm);

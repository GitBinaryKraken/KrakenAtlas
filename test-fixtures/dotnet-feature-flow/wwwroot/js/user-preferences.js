function saveUserPreferences() {
  const userId = document.querySelector("#user-id").value;
  const displayName = document.querySelector("#display-name").value;
  const emailOptIn = document.querySelector("#email-opt-in").checked;

  return fetch("/api/user-preferences", {
    method: "POST",
    body: JSON.stringify({ userId, displayName, emailOptIn })
  });
}

document.getElementById("save-user-preferences").addEventListener("click", saveUserPreferences);

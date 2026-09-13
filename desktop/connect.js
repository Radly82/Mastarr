document.querySelector('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('button');
  const status = document.getElementById('status');
  button.disabled = true;
  status.textContent = '';
  try {
    const result = await window.mastarrDesktop.connect(
      document.getElementById('address').value.trim(),
    );
    if (result.error) status.textContent = result.error;
  } catch {
    status.textContent = 'Could not open your server. Check the address and try again.';
  } finally {
    button.disabled = false;
  }
});

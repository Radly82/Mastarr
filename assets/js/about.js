// Load theme from localStorage
        function loadTheme() {
            const savedTheme = localStorage.getItem('theme') || 'dark';
            const html = document.documentElement;
            
            // Remove all theme attributes
            html.removeAttribute('data-theme');
            
            // Set the selected theme
            if (savedTheme !== 'dark') {
                html.setAttribute('data-theme', savedTheme);
            }
        }

        // Load theme on page load
        loadTheme();

// ═══════════════════════════════════════════════════════════════════
//  CORE / THEME — Dark mode
// ═══════════════════════════════════════════════════════════════════

window.isDarkMode = function() {
  return localStorage.getItem('dj_theme') === 'dark';
};

window.setTheme = function(dark) {
  localStorage.setItem('dj_theme', dark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = dark ? window.ICONS.sun : window.ICONS.moon;
};

window.initTheme = function() {
  var dark = window.isDarkMode();
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = dark ? window.ICONS.sun : window.ICONS.moon;
};

window.toggleTheme = function() {
  window.setTheme(!window.isDarkMode());
};

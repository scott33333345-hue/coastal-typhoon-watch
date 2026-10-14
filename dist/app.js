const tabs = document.querySelectorAll('.time-tabs button');
const path = document.querySelector('.track-forecast');
const pathData = {
  72: 'M693 402 C628 375 574 345 518 309 S407 232 326 184',
  48: 'M693 402 C628 375 574 345 518 309 S461 271 421 244',
  24: 'M693 402 C628 375 574 345 613 365'
};

tabs.forEach((button) => {
  button.addEventListener('click', () => {
    tabs.forEach((tab) => tab.classList.remove('active'));
    button.classList.add('active');
    path.setAttribute('d', pathData[button.dataset.hours]);
  });
});

const locationButton = document.querySelector('#locationButton');
const locationText = document.querySelector('#locationText');
const locations = ['福建 · 厦门', '广东 · 汕头', '浙江 · 温州'];
let locationIndex = 0;
locationButton.addEventListener('click', () => {
  locationIndex = (locationIndex + 1) % locations.length;
  locationText.textContent = locations[locationIndex];
  locationButton.setAttribute('aria-label', `当前演示关注地区：${locations[locationIndex]}，点击切换`);
});

const dialog = document.querySelector('#warningDialog');
document.querySelector('#warningDetail').addEventListener('click', () => dialog.showModal());
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...document.querySelectorAll('nav a')];
const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
}, { threshold: [0.25, 0.55] });
sections.forEach((section) => observer.observe(section));


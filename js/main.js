sb.auth.onAuthStateChange((event) => {
  if(event === 'PASSWORD_RECOVERY'){
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appRoot').style.display = 'none';
    document.getElementById('resetScreen').style.display = 'flex';
  }
});

/* ---------------- Make the Netlify badge draggable -----------------------------------------
   Netlify's own injected "Powered by Netlify" badge can sit on top of page content, including
   buttons like "Email to employee". Since it's added by Netlify itself (not this file), the
   exact element can't be targeted with certainty from here — this searches for the common
   patterns and makes whichever one it finds draggable, so it can be moved out of the way
   rather than removed (removing it may not be permitted on Netlify's free tier). ------------ */
function makeDraggable(el){
  let offsetX = 0, offsetY = 0, dragging = false;
  el.style.cursor = 'move';
  el.addEventListener('mousedown', (e) => {
    dragging = true;
    const rect = el.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    el.style.position = 'fixed';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if(!dragging) return;
    el.style.left = (e.clientX - offsetX) + 'px';
    el.style.top = (e.clientY - offsetY) + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}
function findAndMakeNetlifyBadgeDraggable(){
  const candidates = [
    ...document.querySelectorAll('a[href*="netlify.com"]'),
    ...document.querySelectorAll('a[href*="netlify.app"]'),
    ...document.querySelectorAll('[id*="netlify" i]'),
    ...document.querySelectorAll('[class*="netlify" i]')
  ];
  const badge = candidates.find(el => el.id !== 'scrollFab'); // exclude our own scroll button
  if(badge){
    const target = badge.closest('a') || badge;
    target.style.transform = 'scale(0.6)';
    target.style.transformOrigin = 'bottom right';
    makeDraggable(target);
  }
}
window.addEventListener('load', () => setTimeout(findAndMakeNetlifyBadgeDraggable, 1000));

boot();
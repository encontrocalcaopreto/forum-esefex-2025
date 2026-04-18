/* ═══════════════════════════════════════════════════════════════
   XIII FÓRUM CIENTÍFICO ESEFEX — JAVASCRIPT
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── NAVBAR: scroll effect + mobile menu ────────────────────── */
(function initNavbar() {
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navMenu   = document.getElementById('navMenu');

  // Scroll → add .scrolled
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  // Hamburger toggle
  hamburger.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  // Close menu when any nav link is clicked
  navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  // Dropdown "Mais"
  const dropdownTrigger = document.getElementById('navDropdownTrigger');
  const dropdownMenu    = document.getElementById('navDropdownMenu');
  if (dropdownTrigger && dropdownMenu) {
    dropdownTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdownMenu.classList.toggle('open');
      dropdownTrigger.setAttribute('aria-expanded', String(isOpen));
    });
    // Fechar ao clicar fora
    document.addEventListener('click', () => {
      dropdownMenu.classList.remove('open');
      dropdownTrigger.setAttribute('aria-expanded', 'false');
    });
    // Fechar ao clicar num item interno
    dropdownMenu.querySelectorAll('a').forEach(item => {
      item.addEventListener('click', () => {
        dropdownMenu.classList.remove('open');
        dropdownTrigger.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Active link on scroll
  const sections = document.querySelectorAll('section[id]');
  const links    = document.querySelectorAll('.navbar__link');

  function setActiveLink() {
    let current = '';
    sections.forEach(sec => {
      const top = sec.getBoundingClientRect().top;
      if (top <= 90) current = sec.id;
    });
    links.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
    });
  }
  window.addEventListener('scroll', setActiveLink, { passive: true });
})();

/* ── COUNTDOWN TIMER ─────────────────────────────────────────── */
(function initCountdown() {
  // ⚠️ ATUALIZE ESTA DATA quando as datas do XIII Fórum forem definidas
  // Formato: 'YYYY-MM-DDTHH:MM:SS'
  const TARGET_DATE = new Date('2026-06-11T08:00:00');

  const el = {
    days:  document.getElementById('cd-days'),
    hours: document.getElementById('cd-hours'),
    mins:  document.getElementById('cd-mins'),
    secs:  document.getElementById('cd-secs'),
  };

  if (!el.days) return;

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const diff = TARGET_DATE - Date.now();

    if (diff <= 0) {
      const endDate = new Date('2026-06-12T18:00:00');
      const countdownWrap = el.days.closest('.countdown');
      if (countdownWrap) {
        if (Date.now() < endDate.getTime()) {
          countdownWrap.innerHTML = '<p style="font-size:1.5rem;font-weight:700;color:var(--fire);text-align:center;">🔥 O Fórum está acontecendo agora!</p>';
        } else {
          countdownWrap.innerHTML = '<p style="font-size:1.3rem;font-weight:600;color:var(--text-dim);text-align:center;">O XIII Fórum Científico da EsEFEx foi realizado com sucesso!</p>';
        }
      }
      return;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000)  / 60000);
    const s = Math.floor((diff % 60000)    / 1000);

    el.days.textContent  = pad(d);
    el.hours.textContent = pad(h);
    el.mins.textContent  = pad(m);
    el.secs.textContent  = pad(s);
  }

  tick();
  setInterval(tick, 1000);
})();

/* ── PROGRAMAÇÃO TABS ────────────────────────────────────────── */
(function initTabs() {
  const tabs   = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('aria-controls');

      // Update tabs
      tabs.forEach(t => {
        t.classList.remove('tab--active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('tab--active');
      tab.setAttribute('aria-selected', 'true');

      // Update panels
      panels.forEach(panel => {
        const isTarget = panel.id === targetId;
        panel.hidden = !isTarget;
        if (!isTarget) panel.removeAttribute('data-active');
      });

      // Re-trigger fade-in animations on the newly visible panel
      const activePanel = document.getElementById(targetId);
      activePanel.querySelectorAll('.fade-in').forEach(el => {
        el.classList.remove('visible');
        // Force reflow so the removal takes effect before re-adding
        void el.offsetWidth;
        el.classList.add('visible');
      });
    });
  });
})();

/* ── SCROLL FADE-IN (Intersection Observer) ─────────────────── */
(function initScrollAnimations() {
  const elements = document.querySelectorAll('.fade-in');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          // Stagger delay based on position within parent
          const siblings = Array.from(entry.target.parentElement.querySelectorAll('.fade-in'));
          const idx = siblings.indexOf(entry.target);
          entry.target.style.transitionDelay = `${idx * 0.08}s`;
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  elements.forEach(el => observer.observe(el));
})();

/* ── SMOOTH SCROLL offset (accounts for fixed navbar) ───────── */
(function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const targetId = anchor.getAttribute('href').slice(1);
      const target   = document.getElementById(targetId);
      if (!target) return;

      e.preventDefault();
      const navH   = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;
      const top    = target.getBoundingClientRect().top + window.scrollY - navH - 8;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();

/* ── SPEAKER MODAL ───────────────────────────────────────────── */
(function initSpeakerModal() {
  const dataEl  = document.getElementById('speakersData');
  if (!dataEl) return;

  const speakers = JSON.parse(dataEl.textContent);
  const byId     = {};
  speakers.forEach(s => { byId[s.id] = s; });

  const overlay  = document.getElementById('speakerModal');
  const closeBtn = document.getElementById('modalClose');
  const photo    = document.getElementById('modalPhoto');
  const name     = document.getElementById('modalName');
  const inst     = document.getElementById('modalInst');
  const topic    = document.getElementById('modalTopic');
  const body     = document.getElementById('modalBody');

  const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.5" width="80" height="80">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;

  function openModal(speakerId) {
    const s = byId[speakerId];
    if (!s) return;

    // Photo
    if (s.photo) {
      photo.src = s.photo;
      photo.alt = s.name;
      photo.style.display = '';
      photo.previousElementSibling && photo.previousElementSibling.remove();
    } else {
      photo.style.display = 'none';
      // Insert placeholder SVG before photo if not already there
      if (!photo.previousElementSibling || !photo.previousElementSibling.classList.contains('modal__photo-placeholder')) {
        const wrap = photo.parentElement;
        const div = document.createElement('div');
        div.className = 'modal__photo-placeholder';
        div.innerHTML = PLACEHOLDER_SVG;
        wrap.insertBefore(div, photo);
      }
    }

    name.textContent  = s.name;
    inst.textContent  = s.inst;
    topic.textContent = s.topic;

    // Build body HTML
    let html = '';
    if (s.bio) {
      html += `<p class="modal__bio">${s.bio}</p>`;
    }
    if (s.formacao && s.formacao.length) {
      html += '<p class="modal__section-title">Formação</p>';
      html += '<ul class="modal__list">';
      s.formacao.forEach(item => {
        html += `<li>${item}</li>`;
      });
      html += '</ul>';
    }
    if (s.contato) {
      html += `<p class="modal__bio" style="margin-top:.75rem">${s.contato}</p>`;
    }
    body.innerHTML = html;

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    const placeholder = overlay.querySelector('.modal__photo-placeholder');
    if (placeholder) placeholder.remove();
    photo.style.display = '';
    if (triggerElement) { triggerElement.focus(); triggerElement = null; }
  }

  let triggerElement = null;

  document.querySelectorAll('[data-speaker]').forEach(card => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.style.cursor = 'pointer';

    card.addEventListener('click', () => {
      triggerElement = card;
      openModal(card.getAttribute('data-speaker'));
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerElement = card;
        openModal(card.getAttribute('data-speaker'));
      }
    });
  });

  // Close button
  closeBtn.addEventListener('click', closeModal);

  // Click outside modal box closes overlay
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });
})();

// Lógica de Login
'use strict';

function getLoginErrorMessage(err) {
  if (!err) return 'Error al iniciar sesion.';

  const rawMessage = err.message || err.error_description || err.error || '';
  const message = String(rawMessage).toLowerCase();

  if (message.includes('invalid login credentials')) {
    return 'Correo o contrasena incorrectos.';
  }

  if (message.includes('email not confirmed')) {
    return 'Debes confirmar tu correo electronico.';
  }

  if (message.includes('too many requests') || message.includes('rate limit')) {
    return 'Demasiados intentos. Intenta nuevamente mas tarde.';
  }

  return rawMessage || 'Error al iniciar sesion.';
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const ui = window.LoginUI;

  // --- UI Toggles ---
  const toggleRegisterBtn = document.getElementById('toggle-register');
  const toggleLoginBtn = document.getElementById('toggle-login');
  const loginActions = document.getElementById('login-actions');
  const registerActions = document.getElementById('register-actions');

  if (toggleRegisterBtn) {
      toggleRegisterBtn.addEventListener('click', (e) => {
          e.preventDefault();
          loginForm.classList.add('hidden');
          registerForm.classList.remove('hidden');
          loginActions.classList.add('hidden');
          registerActions.classList.remove('hidden');
          if (ui) ui.clearMessage();
          loadAreas(); // Load areas when opening register
      });
  }

  if (toggleLoginBtn) {
      toggleLoginBtn.addEventListener('click', (e) => {
          e.preventDefault();
          registerForm.classList.add('hidden');
          loginForm.classList.remove('hidden');
          registerActions.classList.add('hidden');
          loginActions.classList.remove('hidden');
          if (ui) ui.clearMessage();
      });
  }

  // --- Load Areas for Dropdown ---
  async function loadAreas() {
      const select = document.getElementById('reg-area');
      if (!select || select.children.length > 1) return; // Already loaded

      try {
          if (!window.sb) throw new Error('Supabase no inicializado');
          const { data: areas, error } = await window.sb.from('areas').select('*').eq('active', true);
          
          if (error) throw error;
          
          (areas || []).forEach(area => {
              const opt = document.createElement('option');
              opt.value = area.id;
              opt.textContent = area.name; // e.g. "Barra"
              opt.dataset.name = area.name;
              select.appendChild(opt);
          });
      } catch (err) {
          console.error('Error loading areas:', err);
          if (ui) ui.showMessage('Error al cargar áreas.', 'error');
      }
  }


  // --- LOGIN SUBMIT ---
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      // Use UI Controller if available
      if (ui) {
          ui.clearMessage();
          ui.setLoadingState(true);
      }

      // 1. Check System State (Apple HIG: Early Feedback)
      if (window.sysConfigError) {
          if (ui) ui.showMessage(window.sysConfigError, 'error');
          return;
      }

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      
      try {
          if (!window.sb) {
              throw new Error('Sistema no inicializado (Supabase).');
          }

          const { data, error } = await window.sb.auth.signInWithPassword({
            email: email,
            password: password,
          });

          if (error) {
              throw error; // Let catch block handle generic auth errors
          }

          // Fetch Profile
          const { data: profile, error: profileError } = await window.sb
                .from('profiles')
                .select('role, area_id, is_active')
                .eq('id', data.user.id)
                .single();

          if (profileError || !profile) {
              await window.sb.auth.signOut();
              throw new Error('No se encontró el perfil de usuario.');
          }

          if (profile && profile.is_active === false) {
              await window.sb.auth.signOut();
              throw new Error('Cuenta desactivada. Contacta administración.');
          }

          // Manually set cache to avoid re-fetch in AuthModule if it runs
          window.currentUser = { ...data.user, profile };

          // Attempt Redirect
          console.log('Login: Attempting redirect for role:', profile.role);
          if (window.AuthModule && typeof window.AuthModule.handleRoleRedirect === 'function') {
              const redirected = window.AuthModule.handleRoleRedirect(profile);
              if (redirected) {
                  return; // Success, navigation happens
              } else {
                  console.warn(`Login: AuthModule found no route for role '${profile.role}'`);
              }
          }

          // Fallback if no redirect happened (Configuration Error)
          await window.sb.auth.signOut();
          throw new Error('Tu rol no tiene acceso configurado.');

      } catch (err) {
          console.error("Login Error:", err);
          const message = getLoginErrorMessage(err);

          if (ui) {
              ui.showMessage(message, 'error');
          } else {
              // Fallback for extreme cases where UI also failed
              console.error("UI Module missing, cannot show error to user:", message);
          }
      }
    });
  }

  // --- REGISTER SUBMIT ---
  if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (ui) { ui.clearMessage(); ui.setLoadingState(true); }

          const email = document.getElementById('reg-email').value.trim();
          const pass = document.getElementById('reg-password').value;
          const confirm = document.getElementById('reg-confirm').value;
          const areaSelect = document.getElementById('reg-area');
          const areaId = areaSelect.value;
          const areaName = areaSelect.options[areaSelect.selectedIndex]?.dataset.name || '';

          if (pass !== confirm) {
              if (ui) ui.showMessage('Las contraseñas no coinciden.', 'error');
              return;
          }
          if (!areaId) {
              if (ui) ui.showMessage('Debes seleccionar un área.', 'error');
              return;
          }

          try {
              if (!window.sb) throw new Error('Sistema no inicializado.');

              // 1. SignUp
              const { data, error } = await window.sb.auth.signUp({
                  email: email,
                  password: pass
              });

              if (error) throw error;
              if (!data.user) throw new Error('No se pudo crear el usuario.');

              // 2. Create Profile
              const role = `staff ${areaName.toLowerCase()}`;
              
              const { error: profileError } = await window.sb.from('profiles').insert({
                  id: data.user.id,
                  email: email,
                  role: role,
                  area_id: areaId,
                  is_active: true // Active by default as per request
              });

              if (profileError) {
                  console.error('Error creating profile:', profileError);
                  // Rollback? Too complex. Just warn.
                  throw new Error('Usuario creado pero falló el perfil. Contacta soporte.');
              }
              
              if (ui) {
                ui.showMessage('Cuenta creada con éxito. Ingresando...', 'success');
                // Brief delay to show success
                setTimeout(() => {
                    // Auto-login flow reuse? 
                    // Actually signUp usually signs in automatically if email confirm is off.
                    // Let's check session.
                    window.location.reload(); 
                }, 1500);
              }

          } catch (err) {
              console.error("Register Error:", err);
              const message = getLoginErrorMessage(err); // reuse msg parser
              if (ui) ui.showMessage(message, 'error');
          }
      });
  }
});

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
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      // Use UI Controller if available
      const ui = window.LoginUI;
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

          window.currentUser = {
              ...data.user,
              profile
          };

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
});

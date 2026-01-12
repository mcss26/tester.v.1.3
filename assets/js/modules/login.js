// Lógica de Login
'use strict';

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      console.log('Login Submit Clicked');
      // alert('Debug: Click recibido'); // Commented out
      
      // Use UI Controller if available
      const ui = window.LoginUI;
      if (ui) {
          ui.clearMessage();
          ui.setLoadingState(true);
      }

      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      
      try {
          if (!window.sb) {
              throw new Error('Sistema no inicializado (Supabase).');
          }

          // alert('Debug: Intentando signIn...');
          const { data, error } = await window.sb.auth.signInWithPassword({
            email: email,
            password: password,
          });

          if (error) {
              throw error;
          }

          // alert("Debug: Login OK. User ID: " + data.user.id);
          
          // Fetch Profile
          const { data: profile, error: profileError } = await window.sb
                .from('profiles')
                .select('role, area_id, is_active')
                .eq('id', data.user.id)
                .single();

          if (profileError || !profile) {
              await window.sb.auth.signOut();
              throw new Error('Perfil no encontrado. Contacta al administrador.');
          }

          if (profile && profile.is_active === false) {
              await window.sb.auth.signOut();
              throw new Error('Usuario desactivado.');
          }

          window.currentUser = {
              ...data.user,
              profile
          };

          console.log('Login: Handling redirect for role:', profile.role);
          if (window.AuthModule && typeof window.AuthModule.handleRoleRedirect === 'function') {
              const redirected = window.AuthModule.handleRoleRedirect(profile);
              if (redirected) {
                  console.log('Login: Redirect handled by AuthModule');
                  return;
              }
          }

          await window.sb.auth.signOut();
          throw new Error('Tu usuario no tiene un rol asignado. Contacta al administrador.');

      } catch (err) {
          console.error("Login error:", err);
          
          // Debug fallback: Always alert if UI is not present or for critical debugging
          alert('Login Error: ' + (err.message || err));

          if (ui) {
              ui.showMessage(err.message || 'Error al iniciar sesión.', 'error');
          }
      }
    });
  }
});

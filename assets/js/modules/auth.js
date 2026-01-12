'use strict';

window.AuthModule = {
    init: async function() {
        if (window.AuthModuleInitialized) {
            console.log('AuthModule already initialized. Skipping.');
            return;
        }
        window.AuthModuleInitialized = true;
        console.log('AuthModule initializing...');
        
        const sb = window.sb;
        if (!sb) {
            console.error('Supabase not initialized');
            return;
        }

        const { data: { session }, error } = await sb.auth.getSession();

        // If on login page, DO NOT redirect unless we have a valid session to forward.
        const path = window.location.pathname;
        const isLogin = path.includes('login.html');

        if (!session) {
            if (!isLogin) {
                this.redirectToLogin();
            }
            return; // Stay on login or where we are (if public)
        }

        // We have a session
        const { data: profile, error: profileError } = await sb.from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profileError || !profile || profile.is_active === false) {
            await sb.auth.signOut();
            if (!isLogin) this.redirectToLogin();
            return;
        }

        // Store global user info
        window.currentUser = { ...session.user, profile };

        // If we are on login page with a valid session, force redirect out.
        // Otherwise, guard the current route.
        if (isLogin) {
            this.handleRoleRedirect(profile); 
        } else {
            this.guardRoute(profile);
        }
    },

    updateUI: function() {
        const currentUser = window.currentUser;
        if (!currentUser) return;

        const profile = currentUser.profile;
        const userInfo = document.getElementById('user-info');
        
        if (userInfo) {
            const name = profile?.full_name || currentUser.email.split('@')[0];
            const email = currentUser.email;
            const roleLabel = profile?.role ? ` <span class="badge-xs">${profile.role}</span>` : '';
            
            userInfo.innerHTML = `
                <p class="sidebar-user-name">${name}${roleLabel}</p>
                <p class="sidebar-user-email">${email}</p>
            `;
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            // Remove old listener if any (to avoid duplicates if called multiple times)? 
            // cloneNode is a cheap way to strip listeners, or just ensure this is called once.
            // Simplified: just add listener.
            logoutBtn.onclick = async () => {
                const sb = window.sb;
                await sb.auth.signOut();
                window.location.href = window.location.pathname.includes('/pages/') ? '../../login.html' : 'login.html';
            };
        }
    },

    handleRoleRedirect: function(profile) {
        if (!profile) return false;
        const role = (profile.role || '').toLowerCase();

        // Determine current page
        const path = window.location.pathname;
        const isIndex = path.endsWith('index.html') || path.endsWith('/');
        const isLogin = path.endsWith('login.html');

        // Only redirect if we are at root or login (Gateway Logic)
        if (!isIndex && !isLogin) return false;

        const roleRoutes = this.getRoleRoutes();
        const target = roleRoutes[role];
        
        console.log(`[Auth] Check Redirect: Role='${role}' -> Target='${target}'`);

        if (target) {
            const resolvedTarget = this.resolvePath(target);
            
            // Avoid circular redirect
            if (path.endsWith(target) || (target === 'index.html' && path === '/')) {
                console.log('[Auth] Already on target path. Aborting redirect.');
                return true; 
            }
            
            console.log(`[Auth] Redirecting to: ${resolvedTarget}`);
            window.location.replace(resolvedTarget);
            return true;
        }

        console.warn(`[Auth] No route defined for role: ${role}`);
        return false;
    },

    getRoleRoutes: function() {
        return {
            admin: 'index.html',
            gerencia: 'pages/gerencia/gerencia-index.html',
            logistica: 'pages/logistica/logistica-index.html',
            operativo: 'pages/operativo/operativo-index.html',
            'encargado barra': 'pages/encargados/encargado-barra.html',
            'staff barra': 'pages/staff/staff-convocatorias.html'
        };
    },

    resolvePath: function(target) {
        if (!target) return '';
        const isNested = window.location.pathname.includes('/pages/');
        return isNested ? `../../${target}` : target;
    },

    redirectToLogin: function() {
        window.location.href = window.location.pathname.includes('/pages/') ? '../../login.html' : 'login.html';
    },

    redirectToRoleHome: function(profile) {
        if (!profile) return;
        const role = (profile.role || '').toLowerCase();
        const target = this.getRoleRoutes()[role];
        if (target) {
            window.location.href = this.resolvePath(target);
        } else {
            this.redirectToLogin();
        }
    },

    guardRoute: function(profile) {
        const role = (profile?.role || '').toLowerCase();
        const path = window.location.pathname;

        const isIndex = path.endsWith('index.html') || path.endsWith('/');
        const isLogin = path.endsWith('login.html');
        if (isIndex || isLogin) return;

        if (!role) {
            this.redirectToLogin();
            return;
        }

        if (role === 'admin') return;

        const rules = [
            { match: /\/pages\/master\//, roles: ['admin'] },
            { match: /\/pages\/admin\//, roles: ['admin'] },
            { match: /\/pages\/contabilidad\//, roles: ['admin'] },
            { match: /\/pages\/herramientas\//, roles: ['admin', 'operativo'] },
            { match: /\/pages\/gerencia\//, roles: ['gerencia'] },
            { match: /\/pages\/logistica\//, roles: ['logistica'] },
            { match: /\/pages\/operativo\//, roles: ['operativo'] },
            { match: /\/pages\/encargados\/encargado-barra\.html$/, roles: ['encargado barra'] },
            { match: /\/pages\/encargados\//, roles: ['admin'] },
            { match: /\/pages\/staff\//, roles: ['staff barra'] }
        ];

        const rule = rules.find((entry) => entry.match.test(path));
        if (!rule) return;

        if (!rule.roles.includes(role)) {
            this.redirectToRoleHome(profile);
        }
    }
};

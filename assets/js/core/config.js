// Configuración de Supabase
console.log("Config.js executing...");

const supabaseUrl = "https://bjisdqbdvgkhhzqbxqll.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaXNkcWJkdmdraGh6cWJ4cWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MTg4MzEsImV4cCI6MjA4Mjk5NDgzMX0.5VsMfvmOR88diX0Xc5kNYAImQuRzQnxu-fPE_H5PrCc";

// Inicialización Única del Cliente
if (typeof window.supabase !== 'undefined') {
    window.sb = window.supabase.createClient(supabaseUrl, supabaseKey);
    console.log('Supabase Client Initialized as window.sb');
} else {
    console.error('CRITICAL: Supabase library not found via CDN.');
    // Apple HIG: Fail silently or show UI later, never alert() on load.
    window.sysConfigError = 'No se pudo conectar con el servidor. Verifica tu conexión.';
}

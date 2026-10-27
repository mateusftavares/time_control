/* Importado antes do supabase.js: o cliente lê e limpa o #hash do link de convite/recuperação
   ao iniciar, e o erro que o Auth manda ali (link expirado) precisa ser lido antes disso. */
export const HASH_INICIAL = new URLSearchParams(location.hash.slice(1));

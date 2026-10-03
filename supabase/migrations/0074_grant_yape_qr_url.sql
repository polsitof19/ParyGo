-- 0074: la 0054 agregó brands.yape_qr_url sin exponerla a authenticated (las
-- columnas de brands se conceden una por una: 0023/0043/0052). Con la sesión
-- del organizador daba "permission denied" y "Mi marca" salía en blanco; el
-- panel lo esquivaba leyendo con service role. Las filas siguen acotadas por
-- la RLS de brands. anon NO: el comprador ve el QR por el server.
grant select (yape_qr_url) on public.brands to authenticated;

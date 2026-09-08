-- aircraft_positions (OpenSky live flight tracking) was already removed from
-- the live database along with that feature; it no longer exists there. This
-- migration documents that removal and drops api_rate_limits, a generic
-- cross-instance rate limiter created alongside it for the opensky-proxy edge
-- function, which was never shipped and has since been removed. No code
-- references either table anymore.
drop table if exists public.aircraft_positions;
drop table if exists public.api_rate_limits;

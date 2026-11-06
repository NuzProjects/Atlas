export const options = {
  hostname_blacklist: null,
  hostname_whitelist: null,
  port_blacklist: null,
  port_whitelist: null,
  allow_direct_ip: true,
  allow_private_ips: false,
  allow_loopback_ips: false,

  client_ip_blacklist: null,
  client_ip_whitelist: null,
  stream_limit_per_host: -1,
  stream_limit_total: -1,
  allow_udp_streams: true,
  allow_tcp_streams: true,

  dns_ttl: 120,
  dns_method: 'lookup',
  dns_servers: null,
  dns_result_order: 'verbatim',

  parse_real_ip: true,
  parse_real_ip_from: ['127.0.0.1'],

  wisp_version: 2,
  wisp_motd: null,
};

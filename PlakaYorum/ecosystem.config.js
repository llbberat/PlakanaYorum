module.exports = {
  apps: [{
    name: "plakayorum",
    script: "./server.js",
    instances: "max", // CPU çekirdek sayısına göre maksimum process oluşturur (Cluster mode)
    exec_mode: "cluster",
    watch: false, // Canlı ortamda watch (izleme) kapalı olmalıdır
    max_memory_restart: "1G", // Herhangi bir memory leak durumunda 1 GB aşılırsa süreci resetler
    env_production: {
      NODE_ENV: "production",
      PORT: 3000
    },
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm Z",
    autorestart: true, // Sunucu çöktüğünde otomatik yeniden başlat
  }]
};

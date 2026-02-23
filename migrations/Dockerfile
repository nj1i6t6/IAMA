FROM migrate/migrate:v4.17.0
COPY ./sql /migrations
ENTRYPOINT ["migrate", "-path=/migrations", "-database=${DATABASE_URL}", "up"]

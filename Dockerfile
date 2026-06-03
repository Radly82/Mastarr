FROM nginx:alpine

COPY index.html settings.html about.html layouts.html modern.html frosty.html MA.png /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80

RUN echo "daemon off;" >> /etc/nginx/nginx.conf

CMD ["nginx"]

FROM nginx:alpine

COPY settings.html about.html layouts.html modern.html frosty.html MA.png /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/

RUN cp /usr/share/nginx/html/modern.html /usr/share/nginx/html/index.html

EXPOSE 80

RUN echo "daemon off;" >> /etc/nginx/nginx.conf

CMD ["nginx"]

FROM nginx:alpine

COPY index.html settings.html about.html MA.png /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

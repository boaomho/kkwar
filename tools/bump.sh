#!/bin/sh
# ใส่เลขเวอร์ชันท้ายไฟล์ js/css ใน index.html เพื่อกันเบราว์เซอร์แคชของเก่า
V=$(date +%Y%m%d%H%M%S)
sed -i -E "s#(href=\"css/style\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(src=\"js/[a-z/_-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" index.html
echo "version $V"

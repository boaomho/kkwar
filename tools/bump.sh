#!/bin/sh
# ใส่เลขเวอร์ชันท้ายไฟล์ js/css ใน index.html เพื่อกันเบราว์เซอร์แคชของเก่า + แสดงเวอร์ชันในหน้าเว็บ
V=$(date +%Y%m%d%H%M%S)
sed -i -E "s#(href=\"css/style\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(src=\"js/[a-z/_-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" index.html
grep -q KKWAR_VERSION js/config.js && sed -i -E "s#window.KKWAR_VERSION = '[0-9]*'#window.KKWAR_VERSION = '$V'#" js/config.js || printf "\nwindow.KKWAR_VERSION = '%s';\n" "$V" >> js/config.js
echo "version $V"

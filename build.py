# page.src.html 에 engine.js 를 끼워 넣어 단독 실행용 index.html 을 만든다. 사용: python3 build.py
head = '<!doctype html>\n<html lang="ko">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n'
src = open('page.src.html', encoding='utf-8').read()
open('index.html', 'w', encoding='utf-8').write(head + src.replace('/*ENGINE*/', open('engine.js', encoding='utf-8').read()))

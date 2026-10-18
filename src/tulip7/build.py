s=open('ui.html').read()
art=open('art.js').read()+'\nconst CARPET="'+open('carpet.b64').read().strip()+'";'
s=s.replace('/*ART*/',art).replace('/*ENGINE*/',open('engine.js').read()).replace('/*GAME*/',open('game.js').read())
open('prototype.html','w').write(s); print(len(s)//1024,'KB')

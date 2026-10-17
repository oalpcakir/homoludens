s=open('ui.html').read()
s=s.replace('/*ART*/',open('art.js').read()).replace('/*ENGINE*/',open('engine.js').read())
open('prototype.html','w').write(s); print(len(s)//1024,'KB')

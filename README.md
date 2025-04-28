# seafront-gui-v2
new seafront gui with gpu acceleration

the initial version of the seafront gui has pretty bad runtime performance, which is caused by
1) using a hand-rolled reactive ui js library that could use some optimization
2) rendering a large number of elements in a canvas-like configuration which requires frequent style recalculations, which are really slow.

the solution then implemented here is:
1) use alpine.js to increase performance of reactive behaviour
2) use gpu rendering (via webgl2-backed three.js) to display the canvas-like components

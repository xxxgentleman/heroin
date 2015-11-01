heroin
======

What is it?
----
It's just a LISP-like implentation based on node.js.

### syntax

>	heroin is LISP in M-expressions, this is the basic syntax.

		functionName(argument1, argument2, argument3);

>	and its special form like cond in LISP and if/else in JavaScript

		(condition1 -> then1; condition2 -> then2; condition3 -> then3);

### compare with JavaScript for now

	JavaScript									heroin

	a + b + c									+(a, b, c);
	a - b - c									-(a, b, c);
	a * b * c									*(a, b, c);
	(a / b) / c									/(a, b, c);
	(a % b) % c									%(a, b, c);
	a = b										=(a, b);
	a === b										==(a, b);
	a < b										<(a, b);
	a > b										>(a, b);
	condition ? then : else						(condition -> then; true -> else);
	delete a									delete(a);
	var a = b									=(a, b);
	return a									return(a);
	var c = function (a, b) { return a + b; }	=(c, lambda((a, b), +(a, b)));

>	If you want to use +=, please use macro like this:

	=(+=, macro((a, b), [=(a, +(a, b))]));
	+=(x, 3);

>	If you want to use ++, please use macro like this:

	=(++, macro((a), [=(a, +(a, 1))]));
	++(x);

>	So to create a standard module to set the basic and useful function and macro is a good way.
>   No looping operators? I think it can be created by recursive of [condition -> then; true -> else], like this:

	=(while, macro((cond, exp), [(cond -> exp; true -> {exp, while(cond, exp)})]));

### compare with LISP for now

	LISP							heroin
	(QUOTE A B C)					[A, B, C];
	(CONS '(A B) C)					cons([A, B], C);
	(CAR '(A B))					car([A, B]);
	(CDR '(A B))					cdr([A, B]);
	(EQ A B)						==(A, B);
	(ATOM A)						atom(A);
	(COND (P1 E1) (P2 E2))			(P1 -> E1; P2 -> E2);

### special form

	{E1; E2; E3; ...; En;};     =>  evluate E1, E2, E3, ..., En; then return the result of En
	{-(5, 4); +(1, 2);};	        =>  return 3

### How to use heroin
> step 1. write what you want to try in a file like try.hrn
> step 2. create a .js file to require heroin.js
> step 3. just node it and see what happen
> I think this module must have a lot of bugs to kill, a lot of exceptations to deal.

### License

[MIT](http://opensource.org/licenses/MIT)

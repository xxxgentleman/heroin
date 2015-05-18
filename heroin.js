var fs = require('fs'),
    global = [], macro = [],
    Reader, Scanner, Parser, Eval, Heroin;

(function () {
    var Reader, States, Scanner, Parser;

    Reader = function (string) {
        var data = string,
            currentPosition = 0,
            dataLength = data.length;

        return {
            nextCharacter: function () {
                if (currentPosition >= dataLength) {
                    return '-1';
                };

                return data.charAt(currentPosition++);
            },

            retract: function () {
                currentPosition -= 1;

                if (currentPosition >= dataLength) {
                    return;
                };

                if (currentPosition < 0) {
                    currentPosition = 0;
                };
            }
        };
    };
}());

(function () {
    var States = {};

    States.START_STATE = 0;
    States.STRING_STATE = States.START_STATE + 1;
    States.COMMENT_STATE = States.STRING_STATE + 1;
    States.NUMBER_STATE = States.COMMENT_STATE + 1;
    States.IDENTIFIER_STATE = States.NUMBER_STATE + 1;

	Scanner = function (reader) {
		var nextCharacter = reader.nextCharacter,
			retract = reader.retract,
			currentLine = 1,
			state = States.START_STATE,
			numDots = 0;

		return {
			nextToken: function () {
				var bufferString = '';

				while (true) {
					switch (state) {
						case States.START_STATE:
							var character = nextCharacter();

							switch (character) {
								case '-1': case ',': case ';': case '^': case '(': case ')': case '[': case ']': case '{': case '}': case '<': case '>':
									return { type: 'separator', text: character };
								case '\r': case '\n':
									currentLine += 1;
									break;
								case "'":
									state = States.STRING_STATE;
									bufferString = character;
									break;
								case '#':
									state = States.COMMENT_STATE;
									bufferString = character;
									break;
								case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
									state = States.NUMBER_STATE;
									bufferString = character;
									break;
								case '-':
									bufferString = character;
									state = (/\d/.test(nextCharacter())) ? States.NUMBER_STATE : States.IDENTIFIER_STATE;
									retract();
									break;
								default:
									if (!/\s/.test(character)) {
										state = States.IDENTIFIER_STATE;
										bufferString = character;
									};
							};

							break;
						case States.STRING_STATE:
							var character = nextCharacter();

							while (character !== "'") {
								bufferString += character;
								character = nextCharacter();
							};

							bufferString += character;
							state = States.START_STATE;

							return { type: 'value', text: bufferString };
						case States.COMMENT_STATE:
							var character = nextCharacter();

							while (character !== '\r' && character !== '\n' && character !== '-1') {
								bufferString += character;

								if (character === '#') {
									break;
								};

								character = nextCharacter();
							};

							state = States.START_STATE;

							return { type: 'comment', text: bufferString };
						case States.NUMBER_STATE:
							var character = nextCharacter();

							while (/[\d\.]/.test(character)) {
								if (character === '.') {
									if (numDots > 1) {
										break;
									} else {
										numDots += 1;
									};
								};

								bufferString += character;
								character = nextCharacter();
							};

							retract();
							state = States.START_STATE;

							return { type: 'value', text: parseFloat(bufferString) };
						case States.IDENTIFIER_STATE:
							var character = nextCharacter();

							while (/[^\,\;\^\(\)\[\]\{\}\"\'\#\r\n\s]/.test(character)) {
								bufferString += character;
								character = nextCharacter();
							};

							retract();
							state = States.START_STATE;

							if (bufferString === 'true' || bufferString === 'false') {
								return { type: 'value', text: bufferString === 'true' };
							} else if (bufferString === '->') {
								return { type: 'separator', text: bufferString };
							} else if (!/\.\.|\.$/.test(bufferString)) {
								return { type: 'identifier', text: bufferString };
							};

							break;
						default:
					};
				};
			}
		};
	};
}());

(function () {
	Parser = function (scanner) {
		var nextToken = scanner.nextToken,
			consumed = true,
			advance, lookAhead, parse, parseCond, currentToken, aheadToken, currentType, currentText;

		advance = function () {
			if (consumed) {
				var token = nextToken();

				while (token.type === 'comment') {
					token = nextToken();
				};

				currentToken = token;
			} else {
				currentToken = aheadToken;
				consumed = true;
			};

			currentType = currentToken.type;
			currentText = currentToken.text;
		};

		lookAhead = function (prop) {
			if (consumed) {
				var token = nextToken();

				while (token.type === 'comment') {
					token = nextToken();
				};

				aheadToken = token;
				consumed = false;
			};

			return (prop === 'type') ? aheadToken.type : aheadToken.text;
		};

		parse = function () {
			var list, flag;

			while (true) {
				switch (lookAhead('type')){
					case 'identifier':
						advance();

						switch (lookAhead('text')) {
							case '(':
								list = [currentText];
								advance();

								if (lookAhead('text') === ')') {
									advance();
								    list.push([]);

								    return list;
								};

								list.push([parse()]);
								flag = list[1];

								continue;
							case ',': case ';': case '^': case ')': case ']': case '}': case '>': case '->':
								return currentText;
							default:
						};

						continue;
					case 'value':
						advance();

						return typeof currentText === 'boolean' ? ['quote', [currentText, false]] : currentText;
					case 'separator':
						switch (lookAhead('text')) {
							case '(': case '[': case '{': case '<':
							    advance();
								
								if (lookAhead('text') === ')') {
									advance();

									return [];
								} else {
									list = currentText === '{' ? ['prog', [parse()]] : [parse()];
								};

								flag = list[1] ? list[1] : list;

								continue;
							case ',': case '^': case ';':
								advance();
								flag.push(currentText !== '^' ? parse() : [parse()]);
								flag = flag[1];

								continue;
							case '->':
								advance();
								list = parseCond(flag);

								continue;
							case ')': case ']': case '}': case '>':
								advance();

								if (flag[0] && !flag[1]) {
								    flag[1] = false;
								};

								return currentText === ']' ? ['quote', [list, false]] : currentText === '>' ? ['unquote', [list, false]] : list;
							default:
						};
					default:
				};
			};
		};

		parseCond = function (conds) {
			var car, flag;

			while (true) {
				if (lookAhead('text') === ';') {
					advance();
					car = parse();
				} else if (lookAhead('text') === '->') {
					advance();
					flag.push([[car, [parse(), false]]]);
					flag = flag[1];
				} else if (lookAhead('text') === ')') {
					flag[1] = false;

					return conds;
				} else {
					conds = ['cond', [[conds[0], [parse(), false]]]];
					flag = conds[1];
				};
			};
		};

		return function () {
			var sentence;

			if (lookAhead('type') === 'separator' && lookAhead('text') === ';') {
				advance();
			};

			sentence = parse();

			return lookAhead('text') === '(' ? [sentence, parse()] : sentence;
		};
	};
}());

(function () {
    var isArray = Array.isArray,
        car, cdr, cons, atom, eq, evcon, apply, Null, primitive, assoc, equal, evlis, pairlis;

    car = function (x) {
        return isArray(x) ? x[0] : false;
    };

    cdr = function (x) {
        return isArray(x) ? x[1] : false;
    };

    cons = function (x, y) {
        return [x, y];
    };

    atom = function (x) {
        return isArray(x) ? (x.length === 0 ? true : false) : true;
    };

    eq = function (x, y) {
        return x === y;
    };

    Null = function (x) {
        if (isArray(x)) {
			return x.length === 0;
		} else {
			return x === false;
		};
    };

    primitive = function (form) {
        var typeofForm = typeof form;

        if (typeofForm === 'string' && form[0] === "'") {
            return true;
        } else {
            return typeofForm === 'number' || typeofForm === 'boolean';
        };
    };

    equal = function (x, y) {
        if (atom(x)) {
            if (atom(y)) {
                return eq(x, y);
            } else {
                return false;
            };
        } else if (equal(car(x), car(y))) {
            return equal(cdr(x), cdr(y));
        } else {
            return false;
        };
    };

    assoc = function (x, scope) {
        if (equal(car(car(scope)), x)) {
            return car(scope);
        } else {
            return assoc(x, cdr(scope));
        };
    };

    pairlis = function (x, y, scope) {
        if (Null(x)) {
            return scope;
        } else {
            return cons(cons(car(x), car(y)), pairlis(cdr(x), cdr(y), scope));
        };
    };

    evcon = function (cond, scope) {
        if (Eval(car(car(cond)), scope)) {
            return Eval(car(cdr(car(cond))), scope);
        } else {
            return evcon(cdr(cond), scope);
        };
    };

    evlis = function (m, scope) {
        if (Null(m)) {
            return false;
        } else {
            return cons(Eval(car(m), scope), evlis(cdr(m), scope));
        };
    };

    apply = function (fn, args, scope) {
        if (atom(fn)) {
            if (eq(fn, 'car')) {
                return car(car(args));
            } else if (eq(fn, 'cdr')) {
                return cdr(car(args));
            } else if (eq(fn, 'cons')) {
                return cons(car(args), car(cdr(args)));
            } else if (eq(fn, 'atom')) {
                return atom(car(args));
            } else if (eq(fn, 'eq')) {
                return eq(car(args), car(cdr(args)));
            } else {
                return apply(Eval(fn, scope), args, scope);
            };
        } else if (eq(car(fn), 'lambda')) {
            return Eval(car(cdr(cdr(form))), pairlis(car(cdr(fn)), args, scope));
        } else if (eq(car(fn), 'var')) {
            return apply(car(cdr(cdr(form))), args, cons(cons(car(cdr(fn)), car(cdr(cdr(fn)))), scope));
        };
    };

    Eval = function (form, scope) {
        if (Null(form)) {
            return false;
        } else if (primitive(form)) {
            return form;
        } else if (atom(form)) {
            return cdr(assoc(form, scope));
        } else if (atom(car(form))) {
            if (eq(car(form), 'quote')) {
                return car(cdr(form));
            } else if (eq(car(form), 'cond')) {
                return evcon(cdr(form), scope);
            } else {
                return apply(car(form), evlis(cdr(form), scope), scope);
            };
        } else {
            return apply(car(form), evlis(cdr(form), scope), scope);
        };
    };
}());

Heroin = function (path) {
    var data = fs.readFileSync(path, 'utf8'),
        nextSentence = Parser(Scanner(Reader(data))),
        sentence;

    return function () {
        while (true) {
            sentence = nextSentence();

            if (sentence === null) {
                console.log('end');
                break;
            } else {
                console.log(Eval(sentence, global));
            };
        };
    };
};

module.exports = Heroin;
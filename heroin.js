var fs = require('fs'),
  readFileSync = fs.readFileSync,
  global = [['Array', Array], [['console', console], false]],
  States, reader, scanner, parser, interpreter, Heroin;

States = {
  START_STATE: 0,
  STRING_STATE: 1,
  COMMENT_STATE: 2,
  NUMBER_STATE: 3,
  IDENTIFIER_STATE: 4
};

reader = function (string) {
  var data = string,
    currentPosition = 0,
    dataLength = data.length;

  return {
    nextCharacter: function () {
      if (currentPosition >= dataLength) {
        return '-1';
      };

      currentPosition += 1;

      return data[currentPosition - 1];
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

scanner = function (reader) {
  var nextCharacter = reader.nextCharacter,
    retract = reader.retract,
    currentLine = 1,
    state = States.START_STATE,
    numDots = 0;

  return function () {
    var bufferString = '', character;

    while (true) {
      switch (state) {
        case States.START_STATE:
          character = nextCharacter();

          switch (character) {
            case '-1': case ',': case ';': case '^': case '(': case ')': case '[': case ']': case '{': case '}':
              return {
                type: 'separator',
                text: character
              };
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
          character = nextCharacter();

          while (character !== "'") {
            bufferString += character;
            character = nextCharacter();
          };

          bufferString += character;
          state = States.START_STATE;

          return {
            type: 'value',
            text: bufferString
          };
        case States.COMMENT_STATE:
          character = nextCharacter();

          while (character !== '\r' && character !== '\n' && character !== '-1') {
            bufferString += character;

            if (character === '#') {
              break;
            };

            character = nextCharacter();
          };

          state = States.START_STATE;

          return {
            type: 'comment',
            text: bufferString
          };
        case States.NUMBER_STATE:
          character = nextCharacter();

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

          return {
            type: 'value',
            text: parseFloat(bufferString)
          };
        case States.IDENTIFIER_STATE:
          character = nextCharacter();

          if (character !== ']') {
            while (/[^\,\;\^\(\)\{\}\"\#\r\n\s]/.test(character)) {
              bufferString += character;
              character = nextCharacter();

              if (character === ']') {
                if (bufferString.indexOf('[') === -1 || bufferString.match(/\[/g).length === (bufferString.match(/\]/g) === null ? 0 : bufferString.match(/\]/g).length)) {
                  break;
                };
              };
            };
          };

          retract();
          state = States.START_STATE;

          if (bufferString === 'true' || bufferString === 'false') {
            return {
              type: 'value',
              text: bufferString === 'true'
            };
          } else if (bufferString === '->') {
            return {
              type: 'separator',
              text: bufferString
            };
          } else if (!/\.\.|\.$/.test(bufferString)) {
            return {
              type: 'identifier',
              text: bufferString
            };
          };
        default:
      };
    };
  };
};

parser = function (scanner) {
  var nextToken = scanner,
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
              list = [currentText === '@' ? 'unquote' : currentText];
              advance();

              if (lookAhead('text') === ')') {
                advance();
                list.push([]);

                return list;
              };

              list.push([parse()]);
              flag = list[1];

              continue;
            case ',': case ';': case '^': case ')': case ']': case '}': case '->':
              return currentText;
            default:
          };

          continue;
        case 'value':
          advance();

          return typeof currentText === 'boolean' ? ['quote', [currentText, false]] : currentText;
        case 'separator':
          switch (lookAhead('text')) {
            case '(': case '[': case '{':
              advance();

              if (lookAhead('text') === ')') {
                advance();

                return [];
              } else {
                list = currentText === '{' ? ['progn', [parse()]] : [parse()];
              };

              flag = list[1] ? list[1] : list;

              continue;
            case ',': case '^': case ';':
              advance();

              if (currentText === ';' && lookAhead('text') === '}') { } else {
                flag.push(currentText === '^' ? parse() : [parse()]);
                flag = flag[1];
              };

              continue;
            case '->':
              advance();
              list = parseCond(flag);

              continue;
            case ')': case ']': case '}':
              advance();

              if (flag[0] && !flag[1]) {
                flag[1] = false;
              };

              if (lookAhead('text') === '(') {
                return [list, parse()];
              } else {
                return currentText === ']' ? (list[1] === false ? ['quote', list] : ['quote', [list, false]]) : list;
              };
            default: // case '-1'
              return null;
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

        if (lookAhead('text') === ')') {
          flag[1] = false;

          return conds;
        } else {
          car = parse();
        };
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

    return sentence;
  };
};

(function () {
  var isArray = Array.isArray,
    car, cdr, cons, atom, eq, Null, equal, pairlis, subst, sublis, subtwo, assoc, primitive, toPath, ARITHMETIC, LOGIC;

  car = function (x) {
    if (isArray(x)) {
      return x[0];
    } else {
      return false;
    };
  };

  cdr = function (x) {
    if (isArray(x)) {
      return x[1];
    } else {
      return false;
    };
  };

  cons = function (x, y) {
    return [x, y];
  };

  atom = function (x) {
    if (isArray(x)) {
      return x.length === 0;
    } else {
      return true;
    };
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

  pairlis = function (x, y, scope) {
    if (Null(x)) {
      return scope;
    } else {
      return cons(cons(car(x), car(y)), pairlis(cdr(x), cdr(y), scope));
    };
  };

  subst = function (x, y, assoc) {
    if (equal(y, assoc)) {
      return x;
    } else if (atom(assoc)) {
      return assoc;
    } else {
      return cons(subst(x, y, car(assoc)), subst(x, y, cdr(assoc)));
    };
  };

  sublis = function (assoc, y) {
    if (atom(y)) {
      return subtwo(assoc, y);
    } else {
      return cons(sublis(assoc, car(y)), sublis(assoc, cdr(y)));
    };
  };

  subtwo = function (assoc, z) {
    if (Null(assoc)) {
      return z;
    } else if (eq(car(car(assoc)), z)) {
      return cdr(car(assoc));
    } else {
      return subtwo(cdr(assoc), z);
    };
  };

  assoc = function (x, scope) {
    if (equal(car(car(scope)), x)) {
      return car(scope);
    } else if (Null(cdr(scope))) {
      return [x, undefined];
    } else {
      return assoc(x, cdr(scope));
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

  toPath = function (label, methods) {
    var length = methods.length,
      path = label,
      i = 0;

    while (i < length) {
      path = path[methods[i]];
      i += 1;
    };

    return path;
  };

  ARITHMETIC = function () {
    var add, subtract, multiply, divide, modulo;

    add = function (form, scope) {
      if (Null(cdr(form))) {
        return car(form);
      } else {
        return car(form) + add(cdr(form), scope);
      };
    };

    subtract = function (form, scope) {
      if (Null(cdr(form))) {
        return - car(form);
      } else {
        return car(form) - add(cdr(form), scope);
      };
    };

    multiply = function (form, scope) {
      if (Null(cdr(form))) {
        return car(form);
      } else {
        return car(form) * multiply(cdr(form), scope);
      };
    };

    divide = function (form, scope) {
      if (Null(cdr(form))) {
        return 1 / car(form);
      } else {
        return car(form) / multiply(cdr(form), scope);
      };
    };

    modulo = function (form, scope) {
      return car(form) % car(cdr(form));
    };

    return {
      '+': add,
      '-': subtract,
      '*': multiply,
      '/': divide,
      '%': modulo
    };
  };

  LOGIC = function () {
    var less;

    less = function (form, scope) {
      return car(form) < car(cdr(form));
    };

    return {
      '<': less
    };
  };

  interpreter = function (metaScope) {
    var global = metaScope,
      Arithmetic = ARITHMETIC(),
      Logic = LOGIC(),
      Eval, quote, evcon, assign, object, progn, remove, apply, evlis, array;

    Eval = function (form, scope) {
      if (Null(form)) {
        return false;
      } else if (primitive(form)) {
        return (typeof form === 'string' && form[0] === "'") ? form.slice(1, -1) : form;
      } else if (atom(form)) {
        if (/\[/.test(form)) {
          form = form.replace(/\]/g, '').replace(/\[/g, '.');
        };

        if (/\./.test(form)) {
          var methods = form.split('.'),
            label = methods.shift();

          return toPath(cdr(assoc(label, scope)), methods);
        } else {
          return cdr(assoc(form, scope));
        };
      } else if (atom(car(form))) {
        if (eq(car(form), 'quote')) {
          return quote(car(cdr(form)), scope);
        } else if (eq(car(form), 'cond')) {
          return evcon(cdr(form), scope);
        } else if (eq(car(form), '=')) {
          return assign(cdr(form), scope);
        } else if (eq(car(form), 'object')) {
          return object(cdr(form), scope);
        } else if (eq(car(form), 'lambda') || eq(car(form), 'macro') || eq(car(form), 'λ')) {
          return form;
        } else if (eq(car(form), 'progn')) {
          return progn(cdr(form), scope);
        } else if (eq(car(form), 'delete')) {
          var returnValue = eq(cdr(assoc(car(cdr(form), scope))), undefined) ? false : true;

          global = remove(car(cdr(form)), scope);

          return returnValue;
        } else if (Arithmetic.hasOwnProperty(car(form))) {
          return Arithmetic[car(form)](evlis(cdr(form), scope), scope);
        } else if (Logic.hasOwnProperty(car(form))) {
          return Logic[car(form)](evlis(cdr(form), scope), scope);
        } else {
          if (eq(car(cdr(assoc(car(form), scope))), 'macro')) {
            return apply(car(form), cdr(form), scope);
          } else{
            return apply(car(form), evlis(cdr(form), scope), scope);
          };
        };
      } else {
        return apply(car(form), evlis(cdr(form), scope), scope);
      };
    };

    quote = function (x, scope) {
      if (eq(car(x), 'unquote')) {
        return Eval(car(cdr(x)), scope);
      } else if (!atom(car(x))) {
        return cons(quote(car(x), scope), quote(cdr(x), scope));
      } else if (eq(cdr(x), false)) {
        return x;
      } else {
        return cons(car(x), quote(cdr(x), scope));
      };
    };

    evcon = function (cond, scope) {
      if (Eval(car(car(cond)), scope)) {
        return Eval(car(cdr(car(cond))), scope);
      } else {
        if (Null(cdr(cond))) {
          return false;
        } else {
          return evcon(cdr(cond), scope);
        };
      };
    };

    assign = function (form, scope) {
      if (cdr(assoc(car(form), scope)) === undefined) {
        global = cons(cons(car(form), Eval(car(cdr(form)), scope)), global);

        return global[0][1];
      } else {
        global = subst(cons(car(form), Eval(car(cdr(form)), scope)), assoc(car(form), scope), scope);

        return cdr(assoc(car(form), global));
      };
    };

    object = function (form, scope, result) {
      result = result ? result : {};
      result[car(car(form))] = Eval(car(cdr(car(form))), scope);

      if (Null(cdr(form))) {
        return result;
      } else {
        return object(cdr(form), scope, result);
      };
    };

    progn = function (form, scope) {
      global = scope;

      if (Null(cdr(form))) {
        return Eval(car(form), global);
      } else if (eq(car(car(form)), 'return')) {
        return Eval(car(car(form)), global);
      } else {
        Eval(car(form), global);

        return progn(cdr(form), global);
      };
    };

    remove = function (label, scope) {
      if (equal(car(car(scope)), label)) {
        return cdr(scope);
      } else {
        return cons(car(scope), remove(label, cdr(scope)));
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
        } else if (eq(fn, '==')) {
          return eq(car(args), car(cdr(args)));
        } else if (eq(fn, 'array')) {
          return array(args, scope);
        } else if (/\./.test(fn)) {
          return Eval(fn, scope)(car(args));
        } else {
          return apply(Eval(fn, scope), args, scope);
        };
      } else if (eq(car(fn), 'lambda') || eq(car(fn), 'λ')) {
        var innerEval = interpreter(pairlis(car(cdr(fn)), args, scope));

        return innerEval(car(cdr(cdr(fn))));
      } else if (eq(car(fn), 'macro')) {
        return Eval(Eval(sublis(pairlis(car(cdr(fn)), args, scope), car(cdr(cdr(fn)))), scope), scope);
      } else if (eq(car(fn), '=')) {
        return apply(car(cdr(cdr(fn))), args, assign(fn, scope));
      };
    };

    evlis = function (form, scope) {
      if (Null(form)) {
        return false;
      } else {
        return cons(Eval(car(form), scope), evlis(cdr(form), scope));
      };
    };

    array = function (form, scope, result) {
      result = result ? result : [];
      result.push(car(form));

      if (Null(cdr(form))) {
        return result;
      } else {
        return array(cdr(form), scope, result);
      };
    };

    return function (sentence) {
      return Eval(sentence, global);
    };
  };
}());

Heroin = function (path) {
  var stdData = readFileSync('./std.hrn', 'utf8'),
    data = readFileSync(path, 'utf8'),
    stdSentence = parser(scanner(reader(stdData))),
    nextSentence = parser(scanner(reader(data))),
    evaluator = interpreter(global),
    State = {
      STD_STATE: 0,
      NORMAL_STATE: 1
    };

  return function () {
    var state = State.STD_STATE,
      sentence;

    while (true) {
      switch (state) {
        case State.STD_STATE:
          sentence = stdSentence();

          if (sentence === null) {
            state = State.NORMAL_STATE;
          } else {
            evaluator(sentence);
          };

          continue;
        default:
          sentence = nextSentence();

          if (sentence === null) {
            return 'end';
          } else {
            evaluator(sentence);
          };
      };
    };
  };
};

module.exports = Heroin;

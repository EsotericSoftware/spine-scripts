if (!Object.create) {
    Object.create = function (o) {
        if (arguments.length > 1) {
            throw new Error('Object.create implementation only accepts the first parameter.');
        }
        function F() {}
        F.prototype = o;
        return new F();
    };
}

String.prototype.toCamelCase = function(){
  return this
         .toLowerCase()
         .replace(/(\s+[a-z])/g, 
            function($1) {
              return $1.toUpperCase().replace(' ', '');
            }
          );
}
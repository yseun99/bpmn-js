'use strict';


var _ = require('lodash');

var AddShapeHandler = require('./cmd/AddShapeHandler'),
    AddConnectionHandler = require('./cmd/AddConnectionHandler');


/**
 * @type djs.ShapeDescriptor
 */

function round(number, resolution) {
  return Math.round(number * resolution) / resolution;
}

/**
 * Creates a HTML container element for a SVG element with
 * the given configuration
 *
 * @param  {Object} options
 * @return {HTMLElement} the container element
 */
function createContainer(options) {

  options = _.extend({}, { width: '100%', height: '100%' }, options);

  var container = options.container || document.body;

  // create a <div> around the svg element with the respective size
  // this way we can always get the correct container size
  // (this is impossible for <svg> elements at the moment)
  var parent = document.createElement('div');
  parent.setAttribute('class', 'djs-container');

  parent.style.position = 'relative';
  parent.style.width = _.isNumber(options.width) ? options.width + 'px' : options.width;
  parent.style.height = _.isNumber(options.height) ? options.height + 'px' : options.height;

  container.appendChild(parent);

  return parent;
}


/**
 * @class
 *
 * @emits Canvas#canvas.init
 *
 * @param {Object} config
 * @param {EventBus} events
 * @param {CommandStack} commandStack
 * @param {GraphicsFactory} graphicsFactory
 * @param {ElementRegistry} elementRegistry
 */
function Canvas(config, events, commandStack, graphicsFactory, elementRegistry, snap) {

  var options = _.extend(config.canvas || {});

  this._snap = snap;
  this._eventBus = events;

  // Creates a <svg> element that is wrapped into a <div>.
  // This way we are always able to correctly figure out the size of the svg element
  // by querying the parent node.
  //
  // (It is not possible to get the size of a svg element cross browser @ 2014-04-01)
  //
  // <div class="djs-container" style="width: {desired-width}, height: {desired-height}">
  //   <svg width="100%" height="100%">
  //    ...
  //   </svg>
  // </div>

  var container = this._container = createContainer(options);

  // svg root
  var paper = this._paper = createPaper(container);

  // drawing root
  var root = this._root = paper.group().attr({ 'class' : 'viewport' });


  function createPaper(container) {
    return graphicsFactory.createPaper({ container: container, width: '100%', height: '100%' });
  }

  /**
   * Validate the id of an element, ensuring it is present and not yet assigned
   */
  function validateId(element) {

    if (!element.id) {
      throw new Error('element must have an id');
    }

    if (elementRegistry.getById(element.id)) {
      throw new Error('element with id ' + element.id + ' already exists');
    }
  }


  // register shape add handlers
  commandStack.registerHandler('shape.add', AddShapeHandler);

  // register connection add handlers
  commandStack.registerHandler('connection.add', AddConnectionHandler);



  /**
   * Adds a shape to the canvas
   *
   * @method Canvas#addShape
   *
   * @param {djs.ShapeDescriptor} shape a descriptor for the shape
   *
   * @return {Canvas} the canvas api
   */
  function addShape(shape) {

    validateId(shape);

    /**
     * An event indicating that a new shape has been added to the canvas.
     *
     * @memberOf Canvas
     *
     * @event shape.added
     * @type {Object}
     * @property {djs.ElementDescriptor} element the shape descriptor
     * @property {Object} gfx the graphical representation of the shape
     */

    commandStack.execute('shape.add', { shape: shape });

    /* jshint -W040 */
    return this;
  }


  /**
   * Adds a connection to the canvas
   *
   * @method Canvas#addConnection
   *
   * @param {djs.ElementDescriptor} connection a descriptor for the connection
   *
   * @return {Canvas} the canvas api
   */
  function addConnection(connection) {

    validateId(connection);

    /**
     * An event indicating that a new connection has been added to the canvas.
     *
     * @memberOf Canvas
     *
     * @event connection.added
     * @type {Object}
     * @property {djs.ElementDescriptor} element the connection descriptor
     * @property {Object} gfx the graphical representation of the connection
     */

    commandStack.execute('connection.add', { connection: connection });

    /* jshint -W040 */
    return this;
  }

  /**
   * Sends a shape to the front.
   *
   * This method takes parent / child relationships between shapes into account
   * and makes sure that children are properly handled, too.
   *
   * @method Canvas#sendToFront
   *
   * @param {djs.ElementDescriptor} shape descriptor of the shape to be sent to front
   * @param {boolean} bubble=true whether to send parent shapes to front, too
   */
  function sendToFront(shape, bubble) {

    if (bubble !== false) {
      bubble = true;
    }

    if (bubble && shape.parent) {
      sendToFront(shape.parent);
    }

    if (shape.children) {
      shape.children.forEach(function(child) {
        sendToFront(child, false);
      });
    }

    var gfx = getGraphics(shape),
        gfxParent = gfx.parent();

    gfx.remove().appendTo(gfxParent);
  }

  /**
   * Return the graphical object underlaying a certain diagram element
   *
   * @method Canvas#getGraphics
   *
   * @param {djs.ElementDescriptor} element descriptor of the element
   */
  function getGraphics(element) {
    return elementRegistry.getGraphicsByElement(element);
  }

  /**
   * Returns the root rendering context on which
   * all elements have to be drawn.
   *
   * @method Canvas#getRoot
   *
   * @returns {snapsvg.Group}
   */
  function getRoot() {
    return root;
  }

  /**
   * Safari mobile (iOS 7) does not fire touchstart event in <SVG> element
   * if there is no shape between 0,0 and viewport elements origin.
   *
   * So touchstart event is only fired when the <g class="viewport"> element was hit.
   * Putting an element over and below the 'viewport' fixes that behavior.
   */
  function addBBoxMarker() {
    var markerStyle = {
      fill: 'none',
      class: 'outer-bound-marker'
    };

    paper.rect(0, 0, 10, 10).attr(markerStyle);
    paper.rect(1000000, 1000000, 10, 10).attr(markerStyle);
  }

  events.on('diagram.init', function(event) {

    addBBoxMarker();

    /**
     * An event indicating that the canvas is ready to be drawn on.
     *
     * @memberOf Canvas
     *
     * @event canvas.init
     *
     * @type {Object}
     * @property {snapsvg.Paper} paper the initialized drawing paper
     */
    events.fire('canvas.init', { root: root, paper: paper });
  });

  events.on('diagram.destroy', function() {

    if (container) {
      var parent = container.parentNode;
      parent.removeChild(container);
    }

    container = this._container = null;
    paper = this._paper = null;
    root = this._root = null;
  });


  // redraw shapes / connections on change

  var self = this;

  events.on('element.changed', function(event) {

    if (event.element.waypoints) {
      events.fire('connection.changed', event);
    } else {
      events.fire('shape.changed', event);
    }
  });

  events.on('shape.changed', function(event) {
    var element = event.element;
    graphicsFactory.updateShape(element, event.gfx || self.getGraphics(element));
  });

  events.on('connection.changed', function(event) {
    var element = event.element;
    graphicsFactory.updateConnection(element, event.gfx || self.getGraphics(element));
  });


  this.addShape = addShape;
  this.addConnection = addConnection;

  this.getRoot  = getRoot;

  this.getContainer = function() {
    return this._container;
  };

  this.getGraphics = getGraphics;

  this.sendToFront = sendToFront;
}

Canvas.prototype._fireViewboxChange = function(viewbox) {
  this._eventBus.fire('canvas.viewbox.changed', { viewbox: viewbox || this.viewbox() });
};

/**
 * Gets or sets the view box of the canvas, i.e. the area that is currently displayed
 *
 * @method Canvas#viewbox
 *
 * @param  {Object} [box] the new view box to set
 * @param  {Number} box.x the top left X coordinate of the canvas visible in view box
 * @param  {Number} box.y the top left Y coordinate of the canvas visible in view box
 * @param  {Number} box.width the visible width
 * @param  {Number} box.height
 *
 * @example
 *
 * canvas.viewbox({ x: 100, y: 100, width: 500, height: 500 })
 *
 * // sets the visible area of the diagram to (100|100) -> (600|100)
 * // and and scales it according to the diagram width
 *
 * @return {Object} the current view box
 */
Canvas.prototype.viewbox = function(box) {

  var root = this._root,
      eventBus = this._eventBus;

  var innerBox,
      outerBox = this.getSize(),
      matrix,
      scale,
      x, y,
      width, height;

  if (!box) {
    innerBox = root.getBBox(true);

    matrix = root.transform().localMatrix;
    scale = round(matrix.a, 1000);

    x = round(-matrix.e || 0, 1000);
    y = round(-matrix.f || 0, 1000);

    return {
      x: x ? x / scale : 0,
      y: y ? y / scale : 0,
      width: outerBox.width / scale,
      height: outerBox.height / scale,
      scale: scale,
      inner: {
        width: innerBox.width,
        height: innerBox.height
      },
      outer: outerBox
    };
  } else {
    scale = Math.max(outerBox.width / box.width, outerBox.height / box.height);

    matrix = new this._snap.Matrix().scale(scale).translate(-box.x, -box.y);
    root.transform(matrix);

    this._fireViewboxChange();
  }

  return box;
};


/**
 * Gets or sets the scroll of the canvas.
 *
 * @param {Object} [delta] the new scroll to apply.
 *
 * @param {Number} [delta.dx]
 * @param {Number} [delta.dy]
 */
Canvas.prototype.scroll = function(delta) {

  var node = this._root.node;
  var matrix = node.getCTM();

  if (delta) {
    delta = _.extend({ dx: 0, dy: 0 }, delta || {});

    matrix = this._paper.node.createSVGMatrix().translate(delta.dx, delta.dy).multiply(matrix);

    setCTM(node, matrix);

    this._fireViewboxChange();
  }

  return { x: matrix.e, y: matrix.f };
};


/**
 * Gets or sets the current zoom of the canvas, optionally zooming to the specified position.
 *
 * @method Canvas#zoom
 *
 * @param {String|Number} [newScale] the new zoom level, either a number, i.e. 0.9,
 *                                   or `fit-viewport` to adjust the size to fit the current viewport
 * @param {String|Point} [center] the reference point { x: .., y: ..} to zoom to, 'auto' to zoom into mid or null
 *
 * @return {Number} the current scale
 */
Canvas.prototype.zoom = function(newScale, center) {

  var snap = this._snap;

  var vbox = this.viewbox();

  if (newScale === undefined) {
    return vbox.scale;
  }

  var outer = vbox.outer;

  if (newScale === 'fit-viewport') {
    newScale = Math.min(1, outer.width / vbox.inner.width);
  }

  if (center === 'auto') {
    center = {
      x: outer.width / 2,
      y: outer.height / 2
    };
  }

  var matrix = this._setZoom(newScale, center);

  this._fireViewboxChange();

  return round(matrix.a, 1000);
};

function setCTM(node, m) {
  var mstr = 'matrix(' + m.a + ',' + m.b + ',' + m.c + ',' + m.d + ',' + m.e + ',' + m.f + ')';
  node.setAttribute('transform', mstr);
}

Canvas.prototype._setZoom = function(scale, center) {

  var svg = this._paper.node,
      viewport = this._root.node;

  var matrix = svg.createSVGMatrix();
  var point = svg.createSVGPoint();

  var centerPoint,
      originalPoint,
      currentMatrix,
      scaleMatrix,
      newMatrix;

  currentMatrix = viewport.getCTM();


  var currentScale = currentMatrix.a;

  if (center) {
    centerPoint = _.extend(point, center);

    // revert applied viewport transformations
    originalPoint = centerPoint.matrixTransform(currentMatrix.inverse());

    // create scale matrix
    scaleMatrix = matrix
                    .translate(originalPoint.x, originalPoint.y)
                    .scale(1 / currentScale * scale)
                    .translate(-originalPoint.x, -originalPoint.y);

    newMatrix = currentMatrix.multiply(scaleMatrix);
  } else {
    newMatrix = matrix.scale(scale);
  }

  setCTM(this._root.node, newMatrix);

  return newMatrix;
};


/**
 * Returns the size of the canvas
 *
 * @return {Dimensions}
 */
Canvas.prototype.getSize = function () {
  return {
    width: this._container.clientWidth,
    height: this._container.clientHeight
  };
};

/**
 * Return the absolute bounding box for the given element
 *
 * The absolute bounding box may be used to display overlays in the
 * callers (browser) coordinate system rather than the zoomed in/out
 * canvas coordinates.
 *
 * @param  {ElementDescriptor} element
 * @return {Bounds} the absolute bounding box
 */
Canvas.prototype.getAbsoluteBBox = function(element) {
  var vbox = this.viewbox();

  var gfx = this.getGraphics(element);

  var transformBBox = gfx.getBBox(true);
  var bbox = gfx.getBBox();

  var x = (bbox.x - transformBBox.x) * vbox.scale - vbox.x * vbox.scale;
  var y = (bbox.y - transformBBox.y) * vbox.scale - vbox.y * vbox.scale;

  var width = (bbox.width + 2 * transformBBox.x) * vbox.scale;
  var height = (bbox.height + 2 * transformBBox.y) * vbox.scale;

  return {
    x: x,
    y: y,
    width: width,
    height: height
  };
};

Canvas.$inject = [
  'config',
  'eventBus',
  'commandStack',
  'graphicsFactory',
  'elementRegistry',
  'snap' ];

module.exports = Canvas;
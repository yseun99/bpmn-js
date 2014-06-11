'use strict';

var fs = require('fs');

var Viewer = require('../../../lib/Viewer');

var Matchers = require('../Matchers');


describe('Viewer', function() {

  beforeEach(Matchers.add);

  var container;

  beforeEach(function() {
    container = document.createElement('div');
    document.getElementsByTagName('body')[0].appendChild(container);
  });

  function createViewer(xml, done) {
    var renderer = new Viewer({ container: container });

    renderer.importXML(xml, function(err) {
      done(err, renderer);
    });
  }


  it('should import simple process', function(done) {

    var xml = fs.readFileSync('test/fixtures/bpmn/simple.bpmn', 'utf8');

    createViewer(xml, done);
  });


  it('should import empty definitions', function(done) {

    var xml = fs.readFileSync('test/fixtures/bpmn/empty-definitions.bpmn', 'utf8');

    createViewer(xml, done);
  });


  describe('error handling', function() {

    it('should handle non-bpmn input', function(done) {

      var xml = 'invalid stuff';

      createViewer(xml, function(err) {

        expect(err).toBeDefined();

        done();
      });
    });


    it('should handle invalid BPMNPlane#bpmnElement', function(done) {

      var xml = fs.readFileSync('test/fixtures/bpmn/error/di-plane-no-bpmn-element.bpmn', 'utf8');

      createViewer(xml, function(err) {
        expect(err).toBeDefined();
        expect(err.message).toEqual('no rootElement referenced in BPMNPlane <BPMNPlane_1>');

        done();
      });
    });

  });


  describe('export', function() {

    it('should export svg', function(done) {

      // given
      var xml = fs.readFileSync('test/fixtures/bpmn/empty-definitions.bpmn', 'utf8');

      createViewer(xml, function(err, renderer) {

        if (err) {
          return done(err);
        }

        // when
        renderer.saveSVG(function(err, svg) {

          if (err) {
            return done(err);
          }

          var expectedStart = '<?xml version="1.0" encoding="utf-8"?>';
          var expectedEnd = '</svg>';

          // then
          expect(svg.indexOf(expectedStart)).toEqual(0);
          expect(svg.indexOf(expectedEnd)).toEqual(svg.length - expectedEnd.length);

          // ensure correct rendering of SVG contents
          expect(svg.indexOf('undefined')).toBe(-1);

          // expect header to be written only once
          expect(svg.indexOf('<svg width="100%" height="100%">')).toBe(-1);

          done();
        });
      });
    });

  });

});
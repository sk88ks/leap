// load beep with web audio api
initAudio();

// set up sliders
var rows = 3;
var columns = 3;
row_slider.value = rows;
row_label.innerHTML = rows;
column_slider.value = columns;
column_label.innerHTML = columns;

var width = document.body.clientWidth,
height = document.body.clientHeight;

var radius = width > height ? height/3 : width/3,
points = [];

// d3 voronoi cell to show closest point regions
var voronoi = d3.geom.voronoi().clipExtent([[-1, -1], [width + 1, height + 1]]),
cells,
quadtree;

var beep_audio = document.getElementById('beep');
beep_audio.addEventListener('ended', function(){
    beep_audio.load();
});

var canvas = d3.select("canvas")
.attr("width", width)
.attr("height", height)
.on("click", function() {
    points.push(d3.mouse(this));
    update();
});

var context = canvas.node().getContext("2d");
context.strokeStyle = "#222";
context.fillStyle = "transparent";

gridMenu();
update();

// update voronoi, closest point detection and item placement
function update() {
    cells = voronoi(points);
    quadtree = d3.geom.quadtree().extent([[0, 0], [width, height]])(points);
    updateBoxes(points);
    redraw();
};

// redraw voronoi cells
function redraw() {
    context.clearRect(0,0,width,height);
    context.strokeStyle = "#222";
    context.fillStyle = "transparent";
    cells.forEach(drawCell);
};

// see d3's general update pattern for how this works
function updateBoxes(data) {
    var drag = d3.behavior.drag()
    .origin(Object)
    .on("dragstart", function(d,i) {
        d3.event.sourceEvent.stopPropagation(); // silence other listeners
    })
    .on("drag", function(d,i) {
        points[i][0] += d3.event.dx;
        points[i][1] += d3.event.dy;
        update();
    })
    .on("dragend", function(d,i) {
    });

    var selection = d3.select("body")
    .selectAll(".box")
    .data(data);

    selection.enter()
    .append("div")
    .attr("class", "box")
    .on("click", function(d,i) {
        if (d3.event.defaultPrevented) return; // click suppressed on drag
        points.splice(i,1);
        update();
    })
    .call(drag);

    selection.exit()
    .remove();

    selection
    .style("top", function(d) { return d[1] + "px"; })
    .style("left", function(d) { return d[0] + "px"; })
    .text(function(d,i) { return i;});
};

// resize, doesn't preserve aspect ratio
window.onresize = debounce(function() {
    var old_width = width;
    var old_height = height;
    width = document.body.clientWidth;
    height = document.body.clientHeight;
    points = points.map(function(d) {
        return [
            d[0]*width/old_width,
            d[1]*height/old_height
        ]
    });
    canvas.attr("width", width).attr("height", height);
    context = canvas.node().getContext("2d");
    voronoi = d3.geom.voronoi().clipExtent([[-1, -1], [width + 1, height + 1]]);
    update();
},200);

// save state for audio
var lastCell = 0,
touched = false;

// listen to leap motion
Leap.loop({enableGestures: true}, function(frame) {
    d3.selectAll(".cursor").remove();
    redraw();

    var box = d3.selectAll(".box")
    .classed("hover", false)

    if (frame.pointables.length < 1) return;
    if (cells.length < 1) return;

    frame.pointables.forEach(function(pointable,i) {
        // only do 1 finger
        if (i > 0) return;

        // interaction box
        var pos = [
            width/2 + 6*pointable.tipPosition[0],
            height - 4*pointable.tipPosition[1] + 150,
            pointable.tipPosition[2]
        ];

        // distance to touch
        var sizeDifference = 100-Math.abs(pos[2]);
        if (sizeDifference < 0) sizeDifference = 0;

        // visual cursor
        var cursor = d3.select("body")
        .append("div")
        .attr("class", "cursor")
        .style({
            top: pos[1] + "px",
            left: pos[0] + "px"
        })
        .append("div")
        .attr("class", "inner")
        .style("width", sizeDifference + "%");

        var closestPoint = [Infinity, Infinity];
        var minDistance = Infinity;

        // search for closest point
        quadtree.visit(function(quad, x1, y1, x2, y2) {
            var rx1 = pos[0] - minDistance,
            rx2 = pos[0] + minDistance,
            ry1 = pos[1] - minDistance,
            ry2 = pos[1] + minDistance;
            if (p = quad.point) {
                var p,
                dx = pos[0] - p[0],
                dy = pos[1] - p[1],
                d2 = dx * dx + dy * dy,
                d = Math.sqrt(d2);
                if (d < minDistance) {
                    closestPoint = p;
                    minDistance = d;
                }
            }
            return x1 > rx2 || x2 < rx1 || y1 > ry2 || y2 < ry1; // bounding box outside closest point
        });

        // render highlighted point
        var closestPointIndex = points.indexOf(closestPoint);

        // boop if different cell
        //if (closestPointIndex !== lastCell) note.play();
        lastCell = closestPointIndex;

        // beep if touched
        if (touched == false && pos[2] < 0) {
            beep_audio.play();
            touched = true;
        }
        if (pos[2] > 0) touched = false;

        // touch zone coloring
        context.fillStyle = pos[2] > 0 ? "#fb5" : "#3c1";
        context.strokeStyle = "#222";
        drawCell(cells[closestPointIndex]);

        var box = d3.selectAll(".box")
        .filter(function(d,i) { return i == closestPointIndex; })
        .classed("hover", true);

    });
});

// draw single voronoi cell
function drawCell(cell) {
    context.beginPath();
    context.moveTo(cell[0][0], cell[0][1]);
    for (var i = 1, l = cell.length; i < l; ++i) context.lineTo(cell[i][0], cell[i][1]);
    context.closePath();
    context.stroke();
    context.fill();
};

// generate locations of polygon vertices
function polygon(n,r,rotation) {
    return function(circle) {
        var results = [];
        var i = 0;
        while (i++ < n) {
            var angle = 2 * Math.PI * i / n + rotation;
            results.push([
                circle[0] + r * Math.cos(angle),
                circle[1] + r * Math.sin(angle)
            ]);
        }
        return results;
    };
};

row_slider.onchange  = function() {
    rows = parseInt(this.value);
    gridMenu();
    update();
    row_label.innerHTML = this.value;
};

column_slider.onchange  = function() {
    columns = parseInt(this.value);
    gridMenu();
    update();
    column_label.innerHTML = this.value;
};

// generate grid of points
function gridMenu() {
    points = [];
    d3.range(rows).forEach(function(i) {
        d3.range(columns).forEach(function(j) {
            points.push([
                (i+1)*width/(rows+1),
                (j+1)*height/(columns+1),
            ]);
        });
    });
};

// do not recall function until wait milliseconds
// call only most recent function
// from Underscore.js
function debounce(func, wait, immediate) {
    var timeout, args, context, timestamp, result;
    return function() {
        context = this;
        args = arguments;
        timestamp = new Date();
        var later = function() {
            var last = (new Date()) - timestamp;
            if (last < wait) {
                timeout = setTimeout(later, wait - last);
            } else {
                timeout = null;
                if (!immediate) result = func.apply(context, args);
            }
        };
        var callNow = immediate && !timeout;
        if (!timeout) {
            timeout = setTimeout(later, wait);
        }
        if (callNow) result = func.apply(context, args);
        return result;
    };
};


// Save/Load
d3.select("#save_button")
.on("click", function() {
    var data = points.map(function(d) {
        return {
            x: ("" + (d[0]/width)).slice(0,8),
            y: ("" + (d[1]/height)).slice(0,8)
        }
    });

    d3.select("#save_data")
    .style("display", "block")
    .select("textarea")
    .node().value = d3.csv.format(data);
});

d3.select("#load_button")
.on("click", function() {
    var csv = d3.select("#save_data textarea")
    .node().value;

    var data = d3.csv.parse(csv);

    points = data.map(function(d) {
        return [
            parseFloat(d.x)*width,
            parseFloat(d.y)*height
        ]
    });

    update();

    d3.select("#save_data")
    .style("display", null);
});
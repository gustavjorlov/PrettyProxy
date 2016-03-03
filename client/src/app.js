import ReactDOM from 'react-dom';
import React from 'react';
import Application from './components/Application.jsx';
import makeStore from './store';

var socket = io('http://localhost:8080');
const store = makeStore();
render(store.getState().toJS());

store.subscribe( () => {
    render(store.getState().toJS());
});

socket.on('log', (data) => {
    console.log(data.status.code);
    store.dispatch({
        type: 'LOG',
        data: data
    });
});

function updateScroll(){
    let element = document.getElementsByClassName("loglist")[0];
    element.scrollTop = element.scrollHeight;
}

function render(state){
    console.log("render with", state);
    ReactDOM.render(
        <Application logs={state.logs} />,
        document.getElementById("list")
    );
    updateScroll();
}
